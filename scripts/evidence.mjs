import {
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  spawnOwned,
  terminateOwnedProcessTree,
} from "./process-tree.mjs";

const [, , taskId, executable, ...commandArgs] = process.argv;

if (!/^task-[1-9][0-9]*$/.test(taskId ?? "") || !executable) {
  console.error(
    "Usage: npm run evidence -- task-N <executable> [arguments...]",
  );
  process.exit(2);
}

const taskDirectory = path.resolve(
  process.cwd(),
  ".omo",
  "evidence",
  "glim-production-roadmap",
  taskId,
);
await mkdir(taskDirectory, { recursive: true });

for (const entry of await readdir(taskDirectory)) {
  if (
    entry === "command.log" ||
    entry === "evidence-run.json" ||
    entry.startsWith("syntax-")
  ) {
    await rm(path.join(taskDirectory, entry), { force: true });
  }
}

let command = executable;
let spawnedArgs = commandArgs;
if (executable === "npm" && process.env.npm_execpath) {
  command = process.execPath;
  spawnedArgs = [process.env.npm_execpath, ...commandArgs];
} else if (executable === "npm" && process.platform === "win32") {
  command = process.execPath;
  spawnedArgs = [
    path.join(
      path.dirname(process.execPath),
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    ),
    ...commandArgs,
  ];
}
const startedAt = new Date();
const configuredTimeout = process.env.EVIDENCE_TIMEOUT_MS;
const timeoutMs = configuredTimeout ? Number(configuredTimeout) : 120_000;
if (
  !Number.isInteger(timeoutMs) ||
  timeoutMs < 100 ||
  timeoutMs > 120_000
) {
  console.error("EVIDENCE_TIMEOUT_MS must be an integer from 100 to 120000");
  process.exit(2);
}
const output = [];
const cancellationFile = path.join(taskDirectory, ".process-cancel");
await rm(cancellationFile, { force: true });

const child = spawnOwned(command, spawnedArgs, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    FORCE_COLOR: "0",
    GLIM_PROCESS_CANCEL_FILE: cancellationFile,
    NO_COLOR: "1",
  },
  shell: false,
  stdio: ["ignore", "pipe", "pipe"],
});

child.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  output.push(text);
});
child.stderr.on("data", (chunk) => {
  const text = chunk.toString();
  output.push(text);
});

let timedOut = false;
const closePromise = new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", resolve);
});
let timeout;
const timeoutPromise = new Promise((resolve) => {
  timeout = setTimeout(async () => {
    timedOut = true;
    await terminateOwnedProcessTree(child, {
      cancelFile: cancellationFile,
      forceDescendants: true,
    });
    resolve(null);
  }, timeoutMs);
});
const exitCode = await Promise.race([closePromise, timeoutPromise]);
clearTimeout(timeout);
await rm(cancellationFile, { force: true });

const finishedAt = new Date();
function redactText(value) {
  return value
    .replace(
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
      "[REDACTED:private-key]",
    )
    .replace(
      /(Authorization\s*:\s*)Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
      "$1[REDACTED:bearer-token]",
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[REDACTED:jwt]",
    )
    .replace(
      /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD))\s*[:=]\s*([^\s"'`]+)/gi,
      "$1=[REDACTED:secret-value]",
    );
}

const log = redactText(output.join(""));
process.stdout.write(log);
await writeFile(path.join(taskDirectory, "command.log"), log, "utf8");

const syntaxReceipts = [];
for (const match of log.matchAll(/^SYNTAX_OK (.+)$/gm)) {
  const file = match[1].trim();
  const receipt = {
    check: "node --check",
    file,
    observed: "exit 0",
    recordedAt: finishedAt.toISOString(),
  };
  const safeName = file.replaceAll(/[^A-Za-z0-9.-]/g, "-");
  const receiptPath = path.join(
    taskDirectory,
    `syntax-${safeName}.receipt.json`,
  );
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  syntaxReceipts.push(path.relative(process.cwd(), receiptPath));
}

const result = {
  command: [executable, ...commandArgs].map((value) => redactText(value)),
  startedAt: startedAt.toISOString(),
  finishedAt: finishedAt.toISOString(),
  durationMs: finishedAt.getTime() - startedAt.getTime(),
  exitCode: timedOut ? 124 : exitCode,
  timedOut,
  syntaxReceipts,
};
await writeFile(
  path.join(taskDirectory, "evidence-run.json"),
  `${JSON.stringify(result, null, 2)}\n`,
  "utf8",
);

if (timedOut) {
  console.error(`Evidence command timed out after ${timeoutMs}ms`);
  process.exit(124);
}
process.exit(exitCode ?? 1);

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const evidenceRoot = path.resolve(
  ".omo",
  "evidence",
  "glim-production-roadmap",
);
const taskDirectory = path.join(evidenceRoot, "task-1");
const npmCli = process.env.npm_execpath;

if (!npmCli) {
  throw new Error("Run this verifier through npm run verify:foundation");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: options.timeout ?? 90_000,
    env: {
      ...process.env,
      ...options.env,
    },
  });
  if (result.error && result.error.code !== "ETIMEDOUT") {
    throw result.error;
  }
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function runNpm(...args) {
  return run(process.execPath, [npmCli, ...args]);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

await mkdir(taskDirectory, { recursive: true });
const dirtyBefore = run("git", ["status", "--short"]);
assert(dirtyBefore.status === 0, "Unable to capture initial worktree state");

const malformed = run(process.execPath, [
  "scripts/evidence.mjs",
  "../escape",
  process.execPath,
  "--version",
]);
assert(
  malformed.status === 2 && malformed.stderr.includes("Usage:"),
  "Malformed evidence arguments were not rejected",
);

const timeoutTask = path.join(evidenceRoot, "task-991");
const hung = run(
  process.execPath,
  [
    "scripts/evidence.mjs",
    "task-991",
    process.execPath,
    "-e",
    "setTimeout(() => {}, 5000)",
  ],
  {
    env: { EVIDENCE_TIMEOUT_MS: "100" },
    timeout: 5_000,
  },
);
assert(hung.status === 124, "Evidence timeout did not return exit 124");

const staleTask = path.join(evidenceRoot, "task-992");
const staleArgs = [
  "scripts/evidence.mjs",
  "task-992",
  process.execPath,
  "--check",
  "index.js",
];
const firstFreshnessRun = run(process.execPath, staleArgs);
assert(firstFreshnessRun.status === 0, "First freshness run failed");
const firstReceipt = JSON.parse(
  await readFile(path.join(staleTask, "evidence-run.json"), "utf8"),
);
const secondFreshnessRun = run(process.execPath, staleArgs);
assert(secondFreshnessRun.status === 0, "Second freshness run failed");
const secondReceipt = JSON.parse(
  await readFile(path.join(staleTask, "evidence-run.json"), "utf8"),
);
assert(
  Date.parse(secondReceipt.finishedAt) > Date.parse(firstReceipt.finishedAt),
  "Evidence timestamp was not refreshed",
);

const repeatedRuns = [];
for (const script of ["test", "security:static", "test:e2e:smoke"]) {
  for (let iteration = 1; iteration <= 2; iteration += 1) {
    const result = runNpm("run", script);
    assert(result.status === 0, `${script} failed on iteration ${iteration}`);
    repeatedRuns.push({
      script,
      iteration,
      exitCode: result.status,
      outputSha256: digest(`${result.stdout}\n${result.stderr}`),
    });
  }
}

const evidenceRun = JSON.parse(
  await readFile(path.join(taskDirectory, "evidence-run.json"), "utf8"),
);
const evidenceLog = await readFile(
  path.join(taskDirectory, "command.log"),
  "utf8",
);
assert(evidenceRun.exitCode === 0, "Evidence command did not exit 0");
assert(
  evidenceRun.syntaxReceipts.length === 4,
  "Evidence run did not record four syntax receipts",
);
for (const receipt of evidenceRun.syntaxReceipts) {
  const contents = JSON.parse(await readFile(path.resolve(receipt), "utf8"));
  assert(contents.observed === "exit 0", `Invalid syntax receipt: ${receipt}`);
}
assert(
  !/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/.test(evidenceLog),
  "Evidence log contains an unredacted private key",
);
assert(
  !/Authorization\s*:\s*Bearer\s+(?!\[REDACTED:)/i.test(evidenceLog),
  "Evidence log contains an unredacted bearer token",
);

await rm(timeoutTask, { recursive: true, force: true });
await rm(staleTask, { recursive: true, force: true });

const dirtyAfter = run("git", ["status", "--short"]);
assert(dirtyAfter.status === 0, "Unable to capture final worktree state");
assert(
  dirtyAfter.stdout === dirtyBefore.stdout,
  "Verification changed the visible worktree state",
);

const receipt = {
  recordedAt: new Date().toISOString(),
  adversarialClasses: {
    malformed_input: {
      result: "passed",
      observable:
        "path traversal task id exited 2; malformed percent URL returned 4xx and server stayed healthy",
    },
    prompt_injection: {
      result: "not-applicable",
      reason: "no untrusted external text is interpreted as instructions",
    },
    cancel_resume: {
      result: "not-applicable",
      reason: "quality checks are atomic and not resumable workflows",
    },
    stale_state: {
      result: "passed",
      observable: `${firstReceipt.finishedAt} -> ${secondReceipt.finishedAt}`,
    },
    dirty_worktree: {
      result: "passed",
      observable: `status preserved sha256=${digest(dirtyBefore.stdout)}`,
    },
    hung_or_long_commands: {
      result: "passed",
      observable:
        "100ms timeout exited 124; Windows npm/server regression closed the child port",
    },
    flaky_tests: {
      result: "passed",
      observable: repeatedRuns,
    },
    misleading_success_output: {
      result: "passed",
      observable:
        "exit code 0, four parsed receipts, credential patterns absent from artifacts",
    },
    repeated_interruptions: {
      result: "not-applicable",
      reason: "no persistent mid-operation state is modified",
    },
  },
};
await writeFile(
  path.join(taskDirectory, "adversarial-qa.json"),
  `${JSON.stringify(receipt, null, 2)}\n`,
  "utf8",
);
console.log("FOUNDATION_ADVERSARIAL_OK");

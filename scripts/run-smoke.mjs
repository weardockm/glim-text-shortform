import path from "node:path";
import process from "node:process";
import {
  spawnOwned,
  terminateOwnedProcessTree,
} from "./process-tree.mjs";

const cli = path.resolve("node_modules", "@playwright", "test", "cli.js");
const browsersPath = path.resolve(".cache", "ms-playwright");
const childEnvironment = {
  ...process.env,
  PLAYWRIGHT_BROWSERS_PATH:
    process.env.PLAYWRIGHT_BROWSERS_PATH ?? browsersPath,
};

const server = spawnOwned(
  process.execPath,
  [
    "scripts/static-server.mjs",
    "--host",
    "127.0.0.1",
    "--port",
    "4173",
  ],
  {
    cwd: process.cwd(),
    env: childEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

server.stderr.pipe(process.stderr);
const ready = new Promise((resolve, reject) => {
  const timeout = setTimeout(
    () => reject(new Error("Static server readiness timed out")),
    10_000,
  );
  server.once("error", reject);
  server.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    if (text.includes("STATIC_SERVER_READY")) {
      clearTimeout(timeout);
      resolve();
    }
  });
});

let exitCode = 1;
let playwright;
let stopping = false;

async function stopOwnedProcesses(exitAfterSignal = null) {
  if (stopping) {
    return;
  }
  stopping = true;
  await Promise.all([
    terminateOwnedProcessTree(playwright),
    terminateOwnedProcessTree(server),
  ]);
  if (exitAfterSignal !== null) {
    process.exit(exitAfterSignal);
  }
}

process.once("SIGINT", () => {
  void stopOwnedProcesses(130);
});
process.once("SIGTERM", () => {
  void stopOwnedProcesses(143);
});

try {
  await ready;
  playwright = spawnOwned(
    process.execPath,
    [cli, "test", "--project=chromium-smoke", "--trace=off"],
    {
      cwd: process.cwd(),
      env: childEnvironment,
      stdio: "inherit",
    },
  );
  exitCode = await new Promise((resolve, reject) => {
    const timeout = setTimeout(async () => {
      await terminateOwnedProcessTree(playwright);
      reject(new Error("Playwright smoke test timed out"));
    }, 60_000);
    playwright.once("error", reject);
    playwright.once("close", (code) => {
      clearTimeout(timeout);
      resolve(code ?? 1);
    });
  });
} finally {
  await stopOwnedProcesses();
}

process.exit(exitCode);

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { rm, readFile, writeFile } from "node:fs/promises";
import { get } from "node:http";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import test from "node:test";

function runNodeWithOptions(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      ...options.env,
    },
    timeout: options.timeout,
  });
}

function runNode(...args) {
  return runNodeWithOptions(args);
}

function requestStatus(port, requestPath) {
  return new Promise((resolve, reject) => {
    const request = get(
      {
        host: "127.0.0.1",
        path: requestPath,
        port,
      },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode));
      },
    );
    request.once("error", reject);
    request.setTimeout(2_000, () => {
      request.destroy(new Error("request timeout"));
    });
  });
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function stopWindowsPortOwner(port) {
  if (process.platform !== "win32") {
    return;
  }
  spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`,
    ],
    {
      encoding: "utf8",
      timeout: 5_000,
    },
  );
}

test("syntax checker records every browser script", () => {
  const result = runNode("scripts/check-syntax.mjs");
  assert.equal(result.status, 0, result.stderr);
  for (const file of [
    "index.js",
    "admin.js",
    "firebase-messaging-sw.js",
    "push-config.js",
    "theme-bootstrap.js",
  ]) {
    assert.match(result.stdout, new RegExp(`SYNTAX_OK ${file.replace(".", "\\.")}`));
  }
});

test("negative security fixtures fail with their exact rule IDs", () => {
  const result = runNode("scripts/verify-negative-fixtures.mjs");
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /NEGATIVE_FIXTURE_OK secret\.private-key/);
  assert.match(result.stdout, /NEGATIVE_FIXTURE_OK unsafe-dom-location-source/);
});

test("secret scanner excludes committed negative fixtures in normal mode", () => {
  const result = runNode("scripts/secret-scan.mjs");
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /secret\.scan\.clean/);
});

test("repository secret scan rejects a synthetic root-level PEM", async () => {
  const fixture = path.resolve(".task1-synthetic-private-key.pem");
  const marker = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
  const endMarker = ["-----END ", "PRIVATE KEY-----"].join("");
  await writeFile(fixture, `${marker}\nRkFLRV9LRVlfREFUQQ==\n${endMarker}\n`);
  try {
    const result = runNode("scripts/secret-scan.mjs");
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, /secret\.private-key/);
    assert.match(result.stderr, /\.task1-synthetic-private-key\.pem:1/);
  } finally {
    await rm(fixture, { force: true });
  }
});

test("evidence helper rejects malformed task identifiers", () => {
  const result = runNode("scripts/evidence.mjs", "../escape", "npm", "run", "check");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage:/);
});

test("evidence helper redacts credentials before writing artifacts", async () => {
  const taskDirectory = path.resolve(
    ".omo",
    "evidence",
    "glim-production-roadmap",
    "task-993",
  );
  const marker = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
  const endMarker = ["-----END ", "PRIVATE KEY-----"].join("");
  const credential = `${marker}\nRkFLRV9LRVlfREFUQQ==\n${endMarker}\nAuthorization: Bearer fixture-token`;
  try {
    const result = runNode(
      "scripts/evidence.mjs",
      "task-993",
      process.execPath,
      "-e",
      "process.stdout.write(process.argv[1])",
      "--",
      credential,
    );
    assert.equal(result.status, 0, result.stderr);
    const log = await readFile(path.join(taskDirectory, "command.log"), "utf8");
    const receipt = await readFile(
      path.join(taskDirectory, "evidence-run.json"),
      "utf8",
    );
    assert.doesNotMatch(log, /RkFLRV9LRVlfREFUQQ/);
    assert.doesNotMatch(receipt, /RkFLRV9LRVlfREFUQQ/);
    assert.doesNotMatch(log, /fixture-token/);
    assert.doesNotMatch(receipt, /fixture-token/);
    assert.match(log, /\[REDACTED:/);
  } finally {
    await rm(taskDirectory, { recursive: true, force: true });
  }
});

test(
  "evidence timeout terminates the owned npm and server process tree",
  { skip: process.platform !== "win32" },
  async () => {
    const port = 4199;
    stopWindowsPortOwner(port);
    const startedAt = Date.now();
    try {
      const result = runNodeWithOptions(
        [
          "scripts/evidence.mjs",
          "task-994",
          "npm",
          "run",
          "test:fixture:server-tree",
        ],
        {
          env: { EVIDENCE_TIMEOUT_MS: "500" },
          timeout: 5_000,
        },
      );
      assert.equal(result.status, 124, `${result.stdout}\n${result.stderr}`);
      assert.ok(Date.now() - startedAt < 4_000, "timeout cleanup hung");
      assert.equal(
        await portIsOpen(port),
        false,
        `server child survived timeout\n${result.stdout}\n${result.stderr}`,
      );
    } finally {
      stopWindowsPortOwner(port);
      await rm(
        path.resolve(
          ".omo",
          "evidence",
          "glim-production-roadmap",
          "task-994",
        ),
        { recursive: true, force: true },
      );
    }
  },
);

test("static server rejects malformed percent encoding and stays healthy", async () => {
  const port = await getAvailablePort();
  const server = spawn(
    process.execPath,
    ["scripts/static-server.mjs", "--host", "127.0.0.1", "--port", `${port}`],
    {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("server readiness timeout")),
        3_000,
      );
      server.once("error", reject);
      server.stdout.on("data", (chunk) => {
        if (chunk.toString().includes("STATIC_SERVER_READY")) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
    const malformedStatus = await requestStatus(port, "/%E0%A4%A");
    assert.ok(
      malformedStatus >= 400 && malformedStatus < 500,
      `unexpected malformed URL status ${malformedStatus}`,
    );
    assert.equal(await requestStatus(port, "/"), 200);
  } finally {
    server.kill("SIGTERM");
  }
});

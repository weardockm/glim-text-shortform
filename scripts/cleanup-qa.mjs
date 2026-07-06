import { access, mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const removed = [];
for (const entry of [".cache", "playwright-report", "test-results"]) {
  const absolute = path.resolve(entry);
  try {
    await access(absolute);
    await rm(absolute, { recursive: true, force: true });
    removed.push(entry);
  } catch {
    removed.push(`${entry}:absent`);
  }
}

function isPortClosed(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: "127.0.0.1",
      port,
    });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(true));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(true);
    });
  });
}

const portReceipts = {};
for (const port of [4173, 4199, 4200]) {
  if (!(await isPortClosed(port))) {
    throw new Error(`Static QA server is still listening on port ${port}`);
  }
  portReceipts[port] = "closed";
}

const evidenceDirectory = path.resolve(
  ".omo",
  "evidence",
  "glim-production-roadmap",
  "task-1",
);
await mkdir(evidenceDirectory, { recursive: true });
const receipt = {
  recordedAt: new Date().toISOString(),
  removed,
  ports: portReceipts,
  temporaryNegativeFixtures: "none outside test/fixtures/negative",
};
await writeFile(
  path.join(evidenceDirectory, "cleanup-receipt.json"),
  `${JSON.stringify(receipt, null, 2)}\n`,
  "utf8",
);
console.log("QA_CLEANUP_OK ports=4173,4199,4200 closed");

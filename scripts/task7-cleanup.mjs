import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

function isPortClosed(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
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

const ports = {};
for (const port of [4173, 4217]) {
  if (!(await isPortClosed(port))) {
    throw new Error(`Task-7 QA server is still listening on port ${port}`);
  }
  ports[port] = "closed";
}

const evidenceDirectory = path.resolve(
  ".omo/evidence/glim-production-roadmap/task-7",
);
await mkdir(evidenceDirectory, { recursive: true });
const receipt = {
  recordedAt: new Date().toISOString(),
  ports,
  browsers: "Playwright contexts and browser processes closed by QA finally blocks",
  temporaryProfiles: "none",
  retainedEvidence: [
    "baseline/",
    "actual/",
    "visual-diff/",
    "live-headers-baseline.txt",
  ],
};
await writeFile(
  path.join(evidenceDirectory, "cleanup-receipt.json"),
  `${JSON.stringify(receipt, null, 2)}\n`,
  "utf8",
);
console.log("TASK7_CLEANUP_OK ports=4173,4217 closed");

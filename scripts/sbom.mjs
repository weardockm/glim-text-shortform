import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const outputDirectory = path.resolve(
  ".omo",
  "evidence",
  "glim-production-roadmap",
  "task-1",
);
await mkdir(outputDirectory, { recursive: true });

const executable = path.resolve(
  "node_modules",
  "@cyclonedx",
  "cyclonedx-npm",
  "bin",
  "cyclonedx-npm-cli.js",
);
const outputFile = path.join(outputDirectory, "sbom.json");
const result = spawnSync(
  process.execPath,
  [
    executable,
    "--output-file",
    outputFile,
    "--output-format",
    "JSON",
    "--spec-version",
    "1.6",
    "--validate",
  ],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);

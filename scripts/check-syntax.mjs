import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const productFiles = [
  "index.js",
  "admin.js",
  "firebase-messaging-sw.js",
  "push-config.js",
  "theme-bootstrap.js",
];
const toolingFiles = [
  "playwright.config.js",
  ...readdirSync("scripts")
    .filter((file) => file.endsWith(".mjs"))
    .map((file) => `scripts/${file}`),
  "test/e2e/smoke.spec.js",
  ...readdirSync(path.join("test", "unit"))
    .filter((file) => file.endsWith(".js") || file.endsWith(".mjs"))
    .map((file) => path.join("test", "unit", file)),
];

for (const file of [...productFiles, ...toolingFiles]) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  const receiptType = productFiles.includes(file) ? "SYNTAX_OK" : "TOOL_SYNTAX_OK";
  console.log(`${receiptType} ${file}`);
}

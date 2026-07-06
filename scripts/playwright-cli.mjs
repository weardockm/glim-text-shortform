import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const cli = path.resolve("node_modules", "@playwright", "test", "cli.js");
const browsersPath = path.resolve(".cache", "ms-playwright");
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH:
      process.env.PLAYWRIGHT_BROWSERS_PATH ?? browsersPath,
  },
  encoding: "utf8",
  stdio: "inherit",
  timeout: 90_000,
});

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);

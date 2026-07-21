import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const astGrep = path.resolve("node_modules", "@ast-grep", "cli", "ast-grep");

const cases = [
  {
    id: "secret.private-key",
    command: process.execPath,
    args: ["scripts/secret-scan.mjs", "--fixtures"],
  },
  {
    id: "unsafe-dom-location-source",
    command: process.platform === "win32" ? process.execPath : astGrep,
    args: [
      ...(process.platform === "win32" ? [astGrep] : []),
      "scan",
      "--config",
      "sgconfig.yml",
      "test/fixtures/negative/unsafe-dom.js",
    ],
  },
];

for (const fixture of cases) {
  const result = spawnSync(fixture.command, fixture.args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error) {
    throw result.error;
  }
  if (result.status === 0 || !combined.includes(fixture.id)) {
    console.error(combined);
    console.error(`negative.fixture.failed ${fixture.id}`);
    process.exit(1);
  }
  console.log(`NEGATIVE_FIXTURE_OK ${fixture.id} exit=${result.status}`);
}

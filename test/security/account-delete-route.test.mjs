import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../../index.js", import.meta.url), "utf8");
const staticServer = fileURLToPath(
  new URL("../../scripts/static-server.mjs", import.meta.url),
);

test("public account deletion route is present and store-linkable without login", () => {
  assert.match(indexHtml, /id="view-account-delete"/);
  assert.match(indexHtml, /id="accountDeleteRequestForm"/);
  assert.match(indexHtml, /accountDeleteRequestEmail/);
  assert.match(indexSource, /function openAccountDeleteView\(\)/);
  assert.match(indexSource, /window\.location\.pathname === "\/account-delete"/);
  assert.match(indexSource, /submitAccountDeletionRequest/);
});

test("static server rewrites public app routes to the buildless app shell", async (t) => {
  const server = spawn(
    process.execPath,
    [staticServer, "--host", "127.0.0.1", "--port", "4265"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  t.after(() => {
    server.kill();
  });
  const [chunk] = await Promise.race([
    once(server.stdout, "data"),
    once(server.stderr, "data"),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("static server readiness timed out")), 5000),
    ),
  ]);
  assert.match(chunk.toString(), /STATIC_SERVER_READY/);

  for (const [path, marker] of [
    ["/account-delete", /id="view-account-delete"/],
    ["/support", /id="view-support"/],
    ["/community-standards", /id="view-community-standards"/],
  ]) {
    const response = await fetch(`http://127.0.0.1:4265${path}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "text/html; charset=utf-8");
    assert.match(await response.text(), marker);
  }
});

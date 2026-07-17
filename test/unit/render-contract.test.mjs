import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("Render blueprint preserves the buildless canonical-domain contract", async () => {
  const source = await readFile(path.resolve("render.yaml"), "utf8");
  assert.match(source, /runtime: static/u);
  assert.match(source, /staticPublishPath: \.\//u);
  assert.match(source, /domains:\s*\n\s*- glimfactory\.com/u);
  assert.doesNotMatch(source, /server\.url/u);
  assert.equal(source.match(/type:\s*rewrite/gu)?.length ?? 0, 5);
  assert.match(
    source,
    /routes:\s*\n\s*-\s*type:\s*rewrite\s*\n\s*source:\s*\/account-delete\s*\n\s*destination:\s*\/index\.html/u,
  );
  assert.match(
    source,
    /source:\s*\/privacy-policy\s*\n\s*destination:\s*\/index\.html/u,
  );
});

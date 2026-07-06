import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inventory = JSON.parse(
  readFileSync(new URL("../../docs/security/dom-sink-inventory.json", import.meta.url), "utf8"),
);

function findInnerHtmlAssignments(file) {
  const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
  return source
    .split(/\r?\n/)
    .flatMap((line, index) => (line.includes(".innerHTML =") ? [`${file}:${index + 1}`] : []));
}

test("Given the reviewed DOM inventory, When source sinks are counted, Then every one is classified exactly once", () => {
  const actual = [...findInnerHtmlAssignments("index.js"), ...findInnerHtmlAssignments("admin.js")];
  const documented = inventory.sinks.map(({ file, line }) => `${file}:${line}`);

  assert.equal(actual.length, 42);
  assert.equal(inventory.expectedCount, 42);
  assert.deepEqual(new Set(documented), new Set(actual));
  assert.equal(documented.length, new Set(documented).size);
});

test("Given each HTML sink, When its review record is inspected, Then classification and ownership are explicit", () => {
  const allowed = new Set(["constant", "safe", "unsafe"]);
  for (const sink of inventory.sinks) {
    assert.ok(allowed.has(sink.classification), `${sink.file}:${sink.line} has invalid classification`);
    assert.ok(sink.rationale.length >= 12, `${sink.file}:${sink.line} lacks rationale`);
    assert.ok(sink.owner.length > 0, `${sink.file}:${sink.line} lacks owner`);
  }
});

test("Given the baseline source, When unsafe sink findings are summarized, Then none are silently accepted", () => {
  const unsafe = inventory.sinks.filter(({ classification }) => classification === "unsafe");
  assert.deepEqual(unsafe, []);
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { proveSinkRhs } from "./sink-proof-engine.mjs";

const sourceByFile = new Map(
  ["index.js", "admin.js"].map((file) => [file, readFileSync(file, "utf8")]),
);
const astGrepArgs = process.platform === "win32"
  ? [process.execPath, path.resolve("node_modules/@ast-grep/cli/ast-grep")]
  : [path.resolve("node_modules/.bin/ast-grep")];

function collectSinks(file) {
  const [astGrep, ...astGrepPrefixArgs] = astGrepArgs;
  return JSON.parse(
    execFileSync(
      astGrep,
      [
        ...astGrepPrefixArgs,
        "run",
        "-p",
        "$EL.innerHTML = $VALUE",
        "--lang",
        "js",
        "--json=compact",
        file,
      ],
      { encoding: "utf8" },
    ),
  );
}

test("Given every production innerHTML assignment, When its RHS is independently analyzed, Then code facts prove safety", () => {
  const matches = [...collectSinks("index.js"), ...collectSinks("admin.js")];
  const proofs = matches.map((match) => ({
    file: match.file,
    line: match.range.start.line + 1,
    ...proveSinkRhs(match, sourceByFile.get(match.file)),
  }));

  assert.equal(matches.length, 42);
  assert.deepEqual(
    proofs.filter(({ safe }) => !safe),
    [],
    `unproven sinks: ${JSON.stringify(proofs.filter(({ safe }) => !safe))}`,
  );
});

test("Given safe and unsafe interpolation mutants, When proof runs, Then aliases and nested branches are analyzed generically", () => {
  const matches = [...collectSinks("index.js"), ...collectSinks("admin.js")];
  const bgm = matches.find((match) =>
    match.metaVariables.single.VALUE.text.includes("track.artist"),
  );
  const notification = matches.find((match) =>
    match.metaVariables.single.VALUE.text.includes("visibleNotifications"),
  );
  const mutate = (match, value) => ({
    ...match,
    metaVariables: {
      ...match.metaVariables,
      single: {
        ...match.metaVariables.single,
        VALUE: { ...match.metaVariables.single.VALUE, text: value },
      },
    },
  });

  assert.equal(
    proveSinkRhs(
      mutate(bgm, `${bgm.metaVariables.single.VALUE.text}\n\`${"${unescapedAlias}"}\``),
      sourceByFile.get("index.js"),
    ).safe,
    false,
  );
  assert.equal(
    proveSinkRhs(
      mutate(
        notification,
        `${notification.metaVariables.single.VALUE.text}\n\`${"${nested ? escapeHtml(alpha) : unescapedAlias}"}\``,
      ),
      sourceByFile.get("index.js"),
    ).safe,
    false,
  );
  assert.equal(
    proveSinkRhs(
      mutate(bgm, '`${escapeHtml(nonstandardIdentifier)}`'),
      sourceByFile.get("index.js"),
    ).safe,
    true,
  );
  assert.equal(
    proveSinkRhs(
      mutate(bgm, '`${flag ? escapeHtml(alpha) : escapeHtml(beta)}`'),
      sourceByFile.get("index.js"),
    ).safe,
    true,
  );
});

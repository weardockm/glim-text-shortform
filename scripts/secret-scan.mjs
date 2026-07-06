import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const fixtureMode = process.argv.includes("--fixtures");
const roots = fixtureMode ? ["test/fixtures/negative"] : ["."];

const excludedDirectories = new Set([
  ".git",
  ".omo",
  "node_modules",
  "playwright-report",
  "test-results",
]);
const excludedFiles = new Set(["scripts/secret-scan.mjs"]);
const excludedPaths = new Set(["test/fixtures/negative"]);

const rules = [
  {
    id: "secret.private-key",
    pattern: /(?<!\/)-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    id: "secret.firebase-private-key-field",
    pattern: /"private_key"\s*:\s*"-----BEGIN PRIVATE KEY-----/g,
  },
  {
    id: "secret.supabase-service-role-jwt",
    pattern:
      /(?:service[_-]?role|SUPABASE_SERVICE_ROLE_KEY)\s*[:=]\s*["']eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+["']/g,
  },
];

async function collectFiles(entry) {
  const absolute = path.resolve(ROOT, entry);
  const normalizedEntry = path.relative(ROOT, absolute).replaceAll("\\", "/");
  if (!fixtureMode && excludedPaths.has(normalizedEntry)) {
    return [];
  }
  let info;
  try {
    info = await stat(absolute);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  if (info.isFile()) {
    return [absolute];
  }

  const files = [];
  for (const child of await readdir(absolute, { withFileTypes: true })) {
    if (child.isDirectory() && excludedDirectories.has(child.name)) {
      continue;
    }
    const relative = path.relative(ROOT, path.join(absolute, child.name));
    files.push(...(await collectFiles(relative)));
  }
  return files;
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

const files = (await Promise.all(roots.map(collectFiles))).flat();
const findings = [];

for (const file of files) {
  const relativeFile = path.relative(ROOT, file).replaceAll("\\", "/");
  if (excludedFiles.has(relativeFile)) {
    continue;
  }
  let source;
  try {
    source = await readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ERR_INVALID_ARG_VALUE") {
      continue;
    }
    throw error;
  }

  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    for (const match of source.matchAll(rule.pattern)) {
      findings.push({
        id: rule.id,
        file: relativeFile,
        line: lineNumber(source, match.index),
      });
    }
  }
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.id} ${finding.file}:${finding.line}`);
  }
  process.exitCode = 1;
} else {
  console.log(`secret.scan.clean files=${files.length}`);
}

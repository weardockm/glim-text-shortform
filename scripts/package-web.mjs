import { copyFile, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const runtimeFiles = [
  "firebase-messaging-sw.js",
  "index.html",
  "index.js",
  "manifest.json",
  "push-config.js",
  "theme-bootstrap.js",
];

const runtimeDirectories = ["assets/fonts", "image"];
const optionalRuntimeDirectories = [".well-known"];

const forbiddenSegments = new Set([
  ".git",
  ".github",
  ".omo",
  "android",
  "ios",
  "node_modules",
  "scripts",
  "security",
  "supabase",
  "test",
]);

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");

function assertRuntimePath(relativePath) {
  const segments = relativePath.split(/[\/]+/);
  const forbiddenSegment = segments.find((segment) => forbiddenSegments.has(segment));
  if (forbiddenSegment) {
    throw new Error(`Refusing to package forbidden path: ${relativePath}`);
  }
}

async function copyRuntimeFile(relativePath) {
  assertRuntimePath(relativePath);
  const source = path.join(rootDir, relativePath);
  const destination = path.join(distDir, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  return relativePath.replaceAll("\\", "/");
}

async function copyRuntimeDirectory(relativeDirectory) {
  assertRuntimePath(relativeDirectory);
  const sourceDirectory = path.join(rootDir, relativeDirectory);
  const copiedFiles = [];
  const entries = await readdir(sourceDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      copiedFiles.push(...(await copyRuntimeDirectory(relativePath)));
    } else if (entry.isFile()) {
      copiedFiles.push(await copyRuntimeFile(relativePath));
    }
  }

  return copiedFiles;
}

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

const copiedFiles = [];
for (const runtimeFile of runtimeFiles) {
  copiedFiles.push(await copyRuntimeFile(runtimeFile));
}

for (const runtimeDirectory of runtimeDirectories) {
  const info = await stat(path.join(rootDir, runtimeDirectory));
  if (!info.isDirectory()) {
    throw new Error(`Runtime asset path is not a directory: ${runtimeDirectory}`);
  }
  copiedFiles.push(...(await copyRuntimeDirectory(runtimeDirectory)));
}

for (const runtimeDirectory of optionalRuntimeDirectories) {
  try {
    const info = await stat(path.join(rootDir, runtimeDirectory));
    if (!info.isDirectory()) {
      throw new Error(`Runtime asset path is not a directory: ${runtimeDirectory}`);
    }
    copiedFiles.push(...(await copyRuntimeDirectory(runtimeDirectory)));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

copiedFiles.sort();
await writeFile(
  path.join(distDir, "glim-package-manifest.json"),
  `${JSON.stringify({ files: copiedFiles }, null, 2)}
`,
  "utf8",
);

console.log(`Packaged ${copiedFiles.length} approved runtime files into dist/`);

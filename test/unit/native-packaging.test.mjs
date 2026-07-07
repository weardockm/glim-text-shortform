import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native packaging contract stays deterministic and store-review safe", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const capacitorPackages = [
    "@capacitor/android",
    "@capacitor/ios",
    "@capacitor/cli",
    "@capacitor/app",
    "@capacitor/browser",
    "@capacitor/core",
    "@capacitor/haptics",
    "@capacitor/keyboard",
    "@capacitor/network",
    "@capacitor/push-notifications",
    "@capacitor/share",
    "@capacitor/splash-screen",
    "@capacitor/status-bar",
  ];

  for (const packageName of capacitorPackages) {
    const version =
      packageJson.dependencies?.[packageName] ??
      packageJson.devDependencies?.[packageName];
    assert.match(version, /^8\.\d+\.\d+$/u, `${packageName} must be exact-pinned`);
  }

  const capacitorConfig = await readFile("capacitor.config.ts", "utf8");
  assert.match(capacitorConfig, /appId: "com\.glimfactory\.glim"/u);
  assert.match(capacitorConfig, /appName: "글림"/u);
  assert.match(capacitorConfig, /webDir: "dist"/u);
  assert.doesNotMatch(capacitorConfig, /servers*:/u);

  const packageScript = await readFile("scripts/package-web.mjs", "utf8");
  for (const forbiddenPath of [
    "admin.html",
    "admin.js",
    "supabase",
    ".omo",
    ".git",
    "test",
    "android",
    "ios",
  ]) {
    assert.doesNotMatch(
      packageScript,
      new RegExp(`runtimeFiles[\s\S]*${forbiddenPath.replace(".", "\\.")}`),
      `${forbiddenPath} must not be in the runtime allowlist`,
    );
  }
  assert.match(packageScript, /forbiddenSegments/u);
  assert.ok(packageScript.includes('const optionalRuntimeDirectories = [".well-known"];'));
});

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
  assert.match(capacitorConfig, /StatusBar:[\s\S]*style: "LIGHT"/u);

  const appSource = await readFile("index.js", "utf8");
  assert.match(appSource, /function syncNativeStatusBarTheme/u);
  assert.match(appSource, /resolvedTheme === "dark" \? "DARK" : "LIGHT"/u);

  const androidManifest = await readFile(
    "android/app/src/main/AndroidManifest.xml",
    "utf8",
  );
  assert.match(androidManifest, /android:name="\.MainActivity"[\s\S]*?android:screenOrientation="portrait"/u);

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

test("Android top-level surfaces consume the shared safe-area inset", async () => {
  const html = await readFile("index.html", "utf8");

  assert.match(
    html,
    /\.explore-header\s*\{[\s\S]*?padding:\s*calc\(16px \+ var\(--top-safe-space\)\) 16px 14px;/u,
    "the explore search header must start below the Android status bar",
  );
  assert.match(
    html,
    /\.refresh-indicator\s*\{[\s\S]*?top:\s*calc\(var\(--top-safe-space\) \+ 14px\);/u,
    "the refresh indicator must preserve its compact safe-area offset",
  );
});

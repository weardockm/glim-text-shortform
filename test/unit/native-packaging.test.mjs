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
  assert.match(packageScript, /"native-auth-bridge.js"/u);
  assert.match(packageScript, /forbiddenSegments/u);
  assert.ok(packageScript.includes('const optionalRuntimeDirectories = [".well-known"];'));
});

test("Android exposes the real navigation bar inset to the bottom navigation", async () => {
  const html = await readFile("index.html", "utf8");
  const appSource = await readFile("index.js", "utf8");
  const activitySource = await readFile(
    "android/app/src/main/java/com/glimfactory/glim/MainActivity.java",
    "utf8",
  );
  const pluginSource = await readFile(
    "android/app/src/main/java/com/glimfactory/glim/GlimInsetsPlugin.java",
    "utf8",
  );

  assert.match(
    html,
    /--bottom-safe-space:\s*max\([\s\S]*?env\(safe-area-inset-bottom, 0px\)[\s\S]*?var\(--native-bottom-safe-space\)/u,
  );
  assert.match(appSource, /getCapacitorPlugin\("GlimInsets"\)/u);
  assert.match(appSource, /--native-bottom-safe-space/u);
  assert.match(activitySource, /registerPlugin\(GlimInsetsPlugin\.class\)/u);
  assert.ok(
    activitySource.indexOf("registerPlugin(GlimInsetsPlugin.class)") <
      activitySource.indexOf("super.onCreate(savedInstanceState)"),
    "custom plugins must be registered before Capacitor initializes the bridge",
  );
  assert.match(pluginSource, /WindowInsetsCompat\.Type\.navigationBars\(\)/u);
  assert.match(pluginSource, /result\.put\("bottom"/u);
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

test("mobile navigation stays icon-only, inset-safe, and flicker-free", async () => {
  const html = await readFile("index.html", "utf8");

  assert.match(
    html,
    /\.context-feed-controls\s*\{[\s\S]*?top:\s*calc\(var\(--top-safe-space\) \+ 16px\);/u,
    "focused post controls must render below the Android status bar",
  );
  assert.match(
    html,
    /\.bgm-picker-topbar\s*\{[\s\S]*?padding:\s*calc\(15px \+ var\(--top-safe-space\)\) 18px 13px;/u,
    "focused picker headers must render below the Android status bar",
  );
  assert.match(
    html,
    /\.nav-text\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?clip-path:\s*inset\(50%\);/u,
    "bottom-navigation labels must remain accessible without being visible",
  );
  for (const label of ["홈", "탐색", "글쓰기", "알림", "프로필"]) {
    assert.match(
      html,
      new RegExp(
        `<button[^>]*class="nav-item[^"]*"[^>]*aria-label="${label}"`,
        "u",
      ),
      `${label} navigation item must retain an accessible name`,
    );
  }
  assert.doesNotMatch(
    html,
    /\.app-view\.active\s*\{[^}]*animation:\s*fadeIn/u,
    "returning views must not fade from a blank frame",
  );
});

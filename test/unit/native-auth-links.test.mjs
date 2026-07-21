import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

function runNode(...args) {
  return spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
}

test("native OAuth callback is bound to verified web links", async () => {
  const manifest = await readFile("android/app/src/main/AndroidManifest.xml", "utf8");
  const appSource = await readFile("index.js", "utf8");
  assert.match(manifest, /android:autoVerify="true"/u);
  assert.match(manifest, /android:scheme="https"/u);
  assert.match(manifest, /android:host="glimfactory\.com"/u);
  assert.match(manifest, /android:pathPrefix="\/auth\/callback"/u);

  const entitlements = await readFile("ios/App/App/App.entitlements", "utf8");
  assert.match(entitlements, /com\.apple\.developer\.associated-domains/u);
  assert.match(entitlements, /applinks:glimfactory\.com/u);

  const xcodeProject = await readFile("ios/App/App.xcodeproj/project.pbxproj", "utf8");
  assert.match(xcodeProject, /CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/u);
  assert.match(manifest, /android:scheme="glim"/u);
  assert.match(manifest, /android:host="auth"/u);
  assert.match(manifest, /android:path="\/callback"/u);
  assert.match(
    appSource,
    /new URL\("\/", GLIM_PRODUCTION_ORIGIN\)/u,
    "the OAuth start wrapper must stay outside the Android App Link callback path",
  );
  assert.doesNotMatch(
    appSource,
    /new URL\(AUTH_CALLBACK_PATH, GLIM_PRODUCTION_ORIGIN\)/u,
  );
});

test("native OAuth browser fallback returns the callback code to the installed app", async () => {
  const bridgeSource = await readFile("native-auth-bridge.js", "utf8");
  const redirectedUrls = [];
  const storage = new Map();
  let now = 1_000_000;
  const sessionStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  const runBridge = (href) =>
    vm.runInNewContext(bridgeSource, {
      URL,
      Date: { now: () => now },
      window: {
        sessionStorage,
        location: {
          href,
          replace: (url) => redirectedUrls.push(url),
        },
      },
    });

  runBridge(
    "https://glimfactory.com/?native_oauth=https%3A%2F%2Fqdnpeliqtxdglqewbvgg.supabase.co%2Fauth%2Fv1%2Fauthorize%3Fprovider%3Dkakao",
  );
  assert.equal(
    redirectedUrls.pop(),
    "https://qdnpeliqtxdglqewbvgg.supabase.co/auth/v1/authorize?provider=kakao",
  );

  runBridge(
    "https://glimfactory.com/auth/callback?code=remote-tablet-code",
  );
  assert.deepEqual(redirectedUrls, [
    "glim://auth/callback?code=remote-tablet-code",
  ]);

  redirectedUrls.length = 0;
  runBridge("https://glimfactory.com/auth/callback?code=web-login-code");
  assert.deepEqual(redirectedUrls, []);

  runBridge(
    "https://glimfactory.com/?native_oauth=https%3A%2F%2Fevil.example%2Fsteal",
  );
  assert.deepEqual(redirectedUrls, []);
  assert.equal(storage.size, 0);

  runBridge(
    "https://glimfactory.com/?native_oauth=https%3A%2F%2Fqdnpeliqtxdglqewbvgg.supabase.co%2Fauth%2Fv1%2Fauthorize",
  );
  runBridge("https://glimfactory.com/");
  redirectedUrls.length = 0;
  runBridge("https://glimfactory.com/auth/callback?code=web-after-cancel");
  assert.deepEqual(redirectedUrls, []);
  assert.equal(storage.size, 0);

  runBridge(
    "https://glimfactory.com/?native_oauth=https%3A%2F%2Fqdnpeliqtxdglqewbvgg.supabase.co%2Fauth%2Fv1%2Fauthorize",
  );
  redirectedUrls.length = 0;
  runBridge("https://glimfactory.com/auth/callback?error=access_denied");
  assert.deepEqual(redirectedUrls, []);
  assert.equal(storage.size, 0);

  runBridge(
    "https://glimfactory.com/?native_oauth=https%3A%2F%2Fqdnpeliqtxdglqewbvgg.supabase.co%2Fauth%2Fv1%2Fauthorize",
  );
  redirectedUrls.length = 0;
  now += 10 * 60 * 1000 + 1;
  runBridge("https://glimfactory.com/auth/callback?code=expired-code");
  assert.deepEqual(redirectedUrls, []);
  assert.equal(storage.size, 0);
});

test("production Android links recognize only the Play-signed build", async () => {
  const assetLinks = JSON.parse(
    await readFile(".well-known/assetlinks.json", "utf8"),
  );
  assert.equal(assetLinks[0].target.package_name, "com.glimfactory.glim");
  assert.deepEqual(assetLinks[0].target.sha256_cert_fingerprints, [
    "C4:B8:31:87:2A:D1:85:48:72:3E:69:07:F2:B1:E6:95:25:71:62:F4:75:74:93:68:2F:DB:1C:4F:BE:AD:DF:9D",
  ]);
});

test("association file generator creates exact production app link documents", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "glim-links-"));
  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/generate-native-associations.mjs", "--out-dir", outDir],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          GLIM_APPLE_TEAM_ID: "ABCDE12345",
          GLIM_ANDROID_SHA256_CERT_FINGERPRINTS:
            "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
        },
      },
    );
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

    const aasa = JSON.parse(
      await readFile(path.join(outDir, ".well-known", "apple-app-site-association"), "utf8"),
    );
    assert.deepEqual(aasa.applinks.details[0].appIDs, [
      "ABCDE12345.com.glimfactory.glim",
    ]);
    assert.deepEqual(aasa.applinks.details[0].components, [
      { "/": "/auth/callback", comment: "Supabase OAuth callback" },
    ]);

    const assetLinks = JSON.parse(
      await readFile(path.join(outDir, ".well-known", "assetlinks.json"), "utf8"),
    );
    assert.equal(assetLinks[0].target.package_name, "com.glimfactory.glim");
    assert.deepEqual(assetLinks[0].target.sha256_cert_fingerprints, [
      "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
    ]);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test("association file generator refuses placeholder production identities", () => {
  const result = runNode("scripts/generate-native-associations.mjs", "--out-dir", os.tmpdir());
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GLIM_APPLE_TEAM_ID/u);
  assert.match(result.stderr, /GLIM_ANDROID_SHA256_CERT_FINGERPRINTS/u);
});

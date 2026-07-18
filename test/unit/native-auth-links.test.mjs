import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function runNode(...args) {
  return spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
}

test("native OAuth callback is bound to verified web links", async () => {
  const manifest = await readFile("android/app/src/main/AndroidManifest.xml", "utf8");
  assert.match(manifest, /android:autoVerify="true"/u);
  assert.match(manifest, /android:scheme="https"/u);
  assert.match(manifest, /android:host="glimfactory\.com"/u);
  assert.match(manifest, /android:pathPrefix="\/auth\/callback"/u);

  const entitlements = await readFile("ios/App/App/App.entitlements", "utf8");
  assert.match(entitlements, /com\.apple\.developer\.associated-domains/u);
  assert.match(entitlements, /applinks:glimfactory\.com/u);

  const xcodeProject = await readFile("ios/App/App.xcodeproj/project.pbxproj", "utf8");
  assert.match(xcodeProject, /CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/u);
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

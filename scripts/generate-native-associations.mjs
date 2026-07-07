import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const appId = "com.glimfactory.glim";
const callbackPath = "/auth/callback";
const androidFingerprintPattern = /^[0-9A-F]{2}(?::[0-9A-F]{2}){31}$/u;
const appleTeamIdPattern = /^[A-Z0-9]{10}$/u;

function getOutDir(argv) {
  const outDirIndex = argv.indexOf("--out-dir");
  if (outDirIndex === -1) return process.cwd();
  const value = argv[outDirIndex + 1];
  if (!value) {
    throw new Error("--out-dir requires a directory path");
  }
  return path.resolve(value);
}

function parseAndroidFingerprints(value) {
  if (!value) return [];
  return value
    .split(",")
    .map((fingerprint) => fingerprint.trim().toUpperCase())
    .filter(Boolean);
}

function collectConfig() {
  const appleTeamId = process.env.GLIM_APPLE_TEAM_ID?.trim().toUpperCase() ?? "";
  const androidFingerprints = parseAndroidFingerprints(
    process.env.GLIM_ANDROID_SHA256_CERT_FINGERPRINTS,
  );
  const errors = [];

  if (!appleTeamIdPattern.test(appleTeamId)) {
    errors.push("GLIM_APPLE_TEAM_ID must be the 10-character Apple Team ID.");
  }
  if (androidFingerprints.length === 0) {
    errors.push(
      "GLIM_ANDROID_SHA256_CERT_FINGERPRINTS must include at least one SHA-256 fingerprint.",
    );
  }
  const invalidFingerprint = androidFingerprints.find(
    (fingerprint) => !androidFingerprintPattern.test(fingerprint),
  );
  if (invalidFingerprint) {
    errors.push(`Invalid Android SHA-256 fingerprint: ${invalidFingerprint}`);
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  return { appleTeamId, androidFingerprints };
}

async function main() {
  const outDir = getOutDir(process.argv.slice(2));
  const { appleTeamId, androidFingerprints } = collectConfig();
  const wellKnownDir = path.join(outDir, ".well-known");
  await mkdir(wellKnownDir, { recursive: true });

  const appleAssociation = {
    applinks: {
      details: [
        {
          appIDs: [`${appleTeamId}.${appId}`],
          components: [
            {
              "/": callbackPath,
              comment: "Supabase OAuth callback",
            },
          ],
        },
      ],
    },
  };

  const androidAssociation = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: appId,
        sha256_cert_fingerprints: androidFingerprints,
      },
    },
  ];

  await writeFile(
    path.join(wellKnownDir, "apple-app-site-association"),
    `${JSON.stringify(appleAssociation, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(wellKnownDir, "assetlinks.json"),
    `${JSON.stringify(androidAssociation, null, 2)}\n`,
    "utf8",
  );

  console.log(`Wrote native association files to ${wellKnownDir}`);
}

try {
  await main();
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Failed to generate native association files.");
  }
  process.exit(1);
}

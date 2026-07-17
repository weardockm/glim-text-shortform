import { readFile } from "node:fs/promises";
import process from "node:process";

const source = await readFile("render.yaml", "utf8");
const requiredFragments = [
  "type: web",
  "name: glim-text-shortform",
  "runtime: static",
  "staticPublishPath: ./",
  "- glimfactory.com",
  "name: Strict-Transport-Security",
  "name: X-Content-Type-Options",
  "name: X-Frame-Options",
  "name: Referrer-Policy",
  "name: Permissions-Policy",
];

const missing = requiredFragments.filter((fragment) => !source.includes(fragment));
if (missing.length > 0) {
  console.error(`render.blueprint.missing ${missing.join(", ")}`);
  process.exit(1);
}
const requiredRewrites = [
  "/account-delete",
  "/auth/callback",
  "/support",
  "/privacy-policy",
  "/community-standards",
];
const rewriteCount = source.match(/type:\s*rewrite/g)?.length ?? 0;
const hasRequiredRewrites = requiredRewrites.every((route) =>
  source.includes(`source: ${route}`) && source.includes("destination: /index.html"),
);
if (
  source.includes("server.url") ||
  rewriteCount !== requiredRewrites.length ||
  !hasRequiredRewrites
) {
  console.error("render.blueprint.unexpected-runtime-routing");
  process.exit(1);
}
console.log("RENDER_BLUEPRINT_OK static buildless root-domain canonical");

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { assertAdminJourneys } from "./admin-flow-probe.mjs";
import { assertAuthenticatedJourneys } from "./authenticated-flow-probes.mjs";
import {
  assertAnonymousAndOAuth,
  renderQaSummary,
  runXssProbes,
} from "./browser-flow-probes.mjs";
import { supabaseBrowserStub } from "./fixtures/supabase-browser-stub.mjs";

const origin = "http://127.0.0.1:4173";
const evidenceDir = ".omo/evidence/glim-production-roadmap/task-3";
const payloads = [
  '<img src=x onerror="window.__xss=1">',
  "<script>window.__xss=1</script>",
  "javascript:window.__xss=1",
  `prefix\u0000\u0008${"가".repeat(20_000)}suffix`,
];
const browserExecutable = [
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("static server did not become ready");
}

await mkdir(evidenceDir, { recursive: true });
const server = spawn(
  process.execPath,
  ["scripts/static-server.mjs", "--host", "127.0.0.1", "--port", "4173"],
  { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);
let browser;
const pageErrors = [];

try {
  await waitForServer();
  browser = await chromium.launch({
    headless: true,
    ...(browserExecutable ? { executablePath: browserExecutable } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  await context.addInitScript({ content: supabaseBrowserStub });
  await context.route(
    /https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@/,
    (route) => route.abort(),
  );
  await context.route(
    /https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
    (route) => route.abort(),
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.waitForFunction(
    () => document.querySelector("#postFeed")?.textContent.includes("아직 보여드릴 문장이 없습니다."),
    undefined,
    { timeout: 10_000 },
  );
  await page.locator("#appSplash").waitFor({ state: "hidden", timeout: 10_000 });

  await assertAnonymousAndOAuth(page);
  const flowResults = await assertAuthenticatedJourneys(page);
  const results = await runXssProbes(page, payloads);
  const adminResults = await assertAdminJourneys(context, origin);
  if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join("; ")}`);
  await renderQaSummary(page, results);
  await page.screenshot({
    path: `${evidenceDir}/browser-xss.png`,
    fullPage: true,
  });
  await context.tracing.stop({ path: `${evidenceDir}/browser-trace.zip` });
  await writeFile(
    `${evidenceDir}/browser-result.json`,
    `${JSON.stringify(
      {
        origin,
        pageErrors,
        flowResults,
        adminResults,
        results,
        payloadClasses: payloads.length,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await context.close();
  console.log(`PASS browser QA: ${payloads.length} payload classes, xssSentinel=0`);
} finally {
  if (browser) await browser.close();
  server.kill();
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  console.log(`CLEANUP serverPid=${server.pid} killed=${server.killed}`);
}

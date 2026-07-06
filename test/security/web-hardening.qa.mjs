import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { supabaseBrowserStub } from "./fixtures/supabase-browser-stub.mjs";

const mode = process.argv.includes("--baseline") ? "baseline" : "actual";
const origin = "http://127.0.0.1:4217";
const evidenceRoot = path.resolve(
  ".omo/evidence/glim-production-roadmap/task-7",
  mode,
);
const viewIds = [
  "view-home",
  "view-context-feed",
  "view-explore",
  "view-write",
  "view-bgm-picker",
  "view-noti",
  "view-profile",
  "view-user-profile",
  "view-settings",
  "view-notification-settings",
  "view-privacy-policy",
  "view-terms-of-service",
  "view-theme-settings",
  "view-account-center",
  "view-notice-detail",
];
const viewports = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
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
  throw new Error("task-7 static server did not become ready");
}

async function routeDependencies(context) {
  await context.addInitScript({ content: supabaseBrowserStub });
  await context.route(
    /https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@/,
    (route) => route.abort(),
  );
  await context.route(
    /https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
    (route) => route.abort(),
  );
}

async function captureApp(browser, viewport) {
  const directory = path.join(evidenceRoot, String(viewport.width));
  await mkdir(directory, { recursive: true });
  const context = await browser.newContext({ viewport });
  await routeDependencies(context);
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.locator("#appSplash").waitFor({ state: "hidden", timeout: 10_000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.evaluate(() => {
    window.__task7CspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__task7CspViolations.push({
        blockedURI: event.blockedURI,
        effectiveDirective: event.effectiveDirective,
      });
    });
  });

  for (const viewId of viewIds) {
    await page.evaluate((id) => {
      activateAppView(id);
      const view = document.getElementById(id);
      if (view) view.scrollTop = 0;
    }, viewId);
    await page.waitForTimeout(350);
    await page.screenshot({
      path: path.join(directory, `${viewId}.png`),
      fullPage: false,
    });
  }

  const probes = {};
  if (mode === "actual") {
    await page.evaluate(() => activateAppView("view-home"));
    probes.visualContracts = await page.evaluate(() => {
      const navIcon = document.querySelector(".nav-icon");
      const iconStyle = navIcon ? getComputedStyle(navIcon) : null;
      const emptyTitle = document.querySelector(".feed-state.is-empty .feed-state-title");
      const emptyStyle = emptyTitle ? getComputedStyle(emptyTitle) : null;
      const textareaStyle = getComputedStyle(
        document.querySelector(".post-textarea"),
      );
      return {
        materialSymbolsLoaded: document.fonts.check(
          '300 24px "Material Symbols Outlined"',
        ),
        iconFontFamily: iconStyle?.fontFamily ?? "",
        navIconWidth: navIcon?.getBoundingClientRect().width ?? 0,
        navIconScrollWidth: navIcon?.scrollWidth ?? 0,
        emptyColor: emptyStyle?.color ?? "",
        emptyToken: getComputedStyle(document.documentElement)
          .getPropertyValue("--glim-text-empty")
          .trim(),
        phraseRects: [],
        textareaWordBreak: textareaStyle.wordBreak,
        textareaOverflowWrap: textareaStyle.overflowWrap,
      };
    });
    for (const viewId of ["view-privacy-policy", "view-terms-of-service"]) {
      await page.evaluate((id) => activateAppView(id), viewId);
      probes.visualContracts.phraseRects.push(
        await page.locator(`#${viewId} .cjk-keep`).first().evaluate(
          (element) => ({
            text: element.textContent.trim(),
            rectCount: element.getClientRects().length,
            width: element.getBoundingClientRect().width,
            parentWidth:
              element.parentElement?.getBoundingClientRect().width ?? 0,
          }),
        ),
      );
    }
    await page.evaluate(() => activateAppView("view-explore"));
    await page.locator("#searchInput").focus();
    const focusDelegated = await page.locator("#exploreHeader").evaluate(
      (element) => element.classList.contains("is-searching"),
    );
    await page.locator("#searchInput").fill("");
    await page.evaluate(() => closeExploreSearch());
    await page.locator("#searchInput").press("Enter");
    await page.waitForTimeout(100);
    const enterDelegated = await page.locator("#exploreHeader").evaluate(
      (element) => element.classList.contains("is-searching"),
    );
    await page.evaluate(() => {
      activateAppView("view-profile");
      document.getElementById("authContainer").style.display = "none";
      document.getElementById("profileContainer").style.display = "block";
      const scroll = document.getElementById("profileGridScroll");
      scroll.scrollLeft = scroll.clientWidth;
      scroll.dispatchEvent(new Event("scroll"));
    });
    await page.waitForTimeout(100);
    const scrollDelegated = await page.locator("#tabIndicator").evaluate(
      (element) => element.style.transform !== "",
    );
    probes.delegatedHandlers = {
      focusDelegated,
      enterDelegated,
      scrollDelegated,
    };
    probes.unsafeMediaRejected = await page.evaluate(
      () => getTrustedMediaUrl("javascript:window.__task7Executed=1") === "",
    );
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    probes.offlineState = await page.locator("#connectivityStatus").evaluate(
      (element) => ({
        visible: element.classList.contains("is-visible"),
        text: element.textContent,
      }),
    );
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    probes.blockedScripts = await page.evaluate(async (manifestUrl) => {
      window.__task7Executed = 0;
      for (const source of [
        "https://blocked.invalid/task-7.js",
        manifestUrl,
      ]) {
        const script = document.createElement("script");
        script.src = source;
        document.head.appendChild(script);
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        executed: window.__task7Executed,
        violations: window.__task7CspViolations,
      };
    }, `${origin}/manifest.json`);
  }

  await context.close();
  return { pageErrors, probes };
}

async function captureAdminDenied(browser, viewport) {
  const directory = path.join(evidenceRoot, String(viewport.width));
  await mkdir(directory, { recursive: true });
  const context = await browser.newContext({ viewport });
  await routeDependencies(context);
  await context.addInitScript(() => {
    window.alert = (message) => {
      const state = document.createElement("div");
      state.id = "adminDeniedQaState";
      state.setAttribute("role", "alert");
      state.style.cssText =
        "position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:24px;background:#050505;color:#f0f0f0;font:16px -apple-system,sans-serif;text-align:center";
      state.textContent = String(message);
      document.addEventListener(
        "DOMContentLoaded",
        () => document.body.appendChild(state),
        { once: true },
      );
    };
  });
  await context.route(`${origin}/admin.js*`, async (route) => {
    const source = readFileSync("admin.js", "utf8").replace(
      'window.location.assign(new URL("index.html", window.location.href).href);',
      'document.documentElement.dataset.qaRedirect = "index.html";',
    );
    await route.fulfill({
      contentType: "application/javascript; charset=utf-8",
      body: source,
    });
  });
  const page = await context.newPage();
  await page.goto(`${origin}/admin.html`, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  await page.locator("#adminDeniedQaState").waitFor({ timeout: 10_000 });
  await page.screenshot({
    path: path.join(directory, "admin-denied.png"),
    fullPage: false,
  });
  const message = await page.locator("#adminDeniedQaState").textContent();
  await context.close();
  return message;
}

async function probeFrameProtection(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const consoleMessages = [];
  page.on("console", (message) => consoleMessages.push(message.text()));
  await page.setContent(`<iframe id="target" src="${origin}/"></iframe>`);
  await page.waitForTimeout(500);
  const childFrames = page.frames().filter((frame) => frame !== page.mainFrame());
  const result = {
    framedApplicationLoaded: childFrames.some(
      (frame) => frame.url() === `${origin}/`,
    ),
    frameUrls: childFrames.map((frame) => frame.url()),
    refusalObserved: consoleMessages.some((message) =>
      /refused to (?:display|frame)/i.test(message),
    ),
  };
  await context.close();
  return result;
}

await mkdir(evidenceRoot, { recursive: true });
const server = spawn(
  process.execPath,
  ["scripts/static-server.mjs", "--host", "127.0.0.1", "--port", "4217"],
  { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);
let browser;
const result = {
  mode,
  viewIds,
  viewports,
  captures: [],
  pageErrors: [],
  adminDenied: [],
  probes: [],
  frameProtection: [],
};

try {
  await waitForServer();
  browser = await chromium.launch({
    channel: browserExecutable ? undefined : "chrome",
    headless: true,
    ...(browserExecutable ? { executablePath: browserExecutable } : {}),
  });
  for (const viewport of viewports) {
    const appResult = await captureApp(browser, viewport);
    result.pageErrors.push(...appResult.pageErrors.map((message) => ({
      viewport: viewport.width,
      message,
    })));
    result.probes.push({ viewport: viewport.width, ...appResult.probes });
    result.adminDenied.push({
      viewport: viewport.width,
      message: await captureAdminDenied(browser, viewport),
    });
    if (mode === "actual") {
      result.frameProtection.push({
        viewport: viewport.width,
        ...(await probeFrameProtection(browser, viewport)),
      });
    }
    result.captures.push(
      ...viewIds.map((viewId) => ({
        viewport: viewport.width,
        state: viewId,
        file: `${viewport.width}/${viewId}.png`,
      })),
      {
        viewport: viewport.width,
        state: "admin-denied",
        file: `${viewport.width}/admin-denied.png`,
      },
    );
  }
  if (result.pageErrors.length) {
    throw new Error(
      `task-7 page errors: ${result.pageErrors.map(({ message }) => message).join("; ")}`,
    );
  }
  if (
    result.adminDenied.some(
      ({ message }) => message !== "접근 권한이 없습니다. (관리자 전용 구역)",
    )
  ) {
    throw new Error("admin denial state did not match the production message");
  }
  if (
    mode === "actual" &&
    result.probes.some(
      ({ delegatedHandlers, unsafeMediaRejected, offlineState, blockedScripts }) =>
        !delegatedHandlers?.focusDelegated ||
        !delegatedHandlers?.enterDelegated ||
        !delegatedHandlers?.scrollDelegated ||
        !unsafeMediaRejected ||
        !offlineState?.visible ||
        !offlineState.text.includes("연결이 끊겼습니다") ||
        blockedScripts?.executed !== 0 ||
        !blockedScripts?.violations.some(
          ({ effectiveDirective }) => effectiveDirective === "script-src-elem",
        ),
    )
  ) {
    throw new Error("task-7 CSP, URL, or offline probe failed");
  }
  if (
    mode === "actual" &&
    result.probes.some(({ visualContracts }) => {
      if (
        !visualContracts?.materialSymbolsLoaded ||
        !visualContracts.iconFontFamily.includes("Material Symbols Outlined") ||
        visualContracts.navIconWidth < 1 ||
        visualContracts.navIconScrollWidth < 1 ||
        visualContracts.navIconWidth > 32 ||
        visualContracts.navIconScrollWidth > 32 ||
        visualContracts.emptyColor !== "rgb(85, 85, 85)" ||
        visualContracts.emptyToken !== "#555" ||
        visualContracts.textareaWordBreak !== "keep-all" ||
        visualContracts.textareaOverflowWrap !== "normal"
      ) {
        return true;
      }
      return visualContracts.phraseRects.some(
        ({ rectCount, width, parentWidth }) =>
          rectCount !== 1 || width > parentWidth,
      );
    })
  ) {
    throw new Error("task-7 icon, contrast, or CJK visual contract failed");
  }
  if (
    mode === "actual" &&
    result.frameProtection.some(({ framedApplicationLoaded }) => framedApplicationLoaded)
  ) {
    throw new Error("task-7 frame protection probe failed");
  }
  await writeFile(
    path.join(evidenceRoot, "capture-result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `PASS task-7 ${mode} capture: ${result.captures.length} states, pageErrors=0`,
  );
} finally {
  if (browser) await browser.close();
  server.kill();
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  console.log(`CLEANUP task-7 serverPid=${server.pid} killed=${server.killed}`);
}

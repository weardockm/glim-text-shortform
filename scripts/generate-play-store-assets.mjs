import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { supabaseBrowserStub } from "../test/security/fixtures/supabase-browser-stub.mjs";
import { terminateOwnedProcessTree } from "./process-tree.mjs";

const root = process.cwd();
const outputRoot = path.join(root, "store-assets", "google-play");
const mockupOutputRoot = path.join(root, "store-assets", "figma-tablet-mockups");
const localUrl = "http://127.0.0.1:4173/";
const fixturePosts = [
  { id: "store-post-1", user_id: "store-user-1", author: "새벽산책", content: "천천히 읽어도 괜찮은 밤.\n잠시 멈춰 읽은 한 문장이\n오늘의 속도를 바꿔 놓았다.", mood: "사색", created_at: "2026-07-17T09:00:00Z", likes_count: 128, dislikes_count: 0 },
  { id: "store-post-2", user_id: "store-user-2", author: "여름의문장", content: "도파민에 지친 마음에는\n새로운 자극보다 조용한 여백이 필요했다.", mood: "위로", created_at: "2026-07-17T08:30:00Z", likes_count: 94, dislikes_count: 0 },
  { id: "store-post-3", user_id: "store-user-3", author: "느린호흡", content: "오늘의 속도를 낮추면\n그제야 들리는 마음이 있다.", mood: "일상", created_at: "2026-07-17T08:00:00Z", likes_count: 76, dislikes_count: 0 },
];

function waitForServer(server) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Static server timed out")), 10_000);
    server.once("error", reject);
    server.stdout.on("data", (chunk) => {
      if (!chunk.toString().includes("STATIC_SERVER_READY")) return;
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function createBrandAssets(browser) {
  const logo = await readFile(path.join(root, "image", "app-logo.png"));
  const logoUrl = `data:image/png;base64,${logo.toString("base64")}`;
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await page.setContent('<canvas id="icon" width="512" height="512"></canvas>');
  const iconDataUrl = await page.locator("#icon").evaluate(async (canvas, source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, 512, 512);
    return canvas.toDataURL("image/png");
  }, logoUrl);
  await writeFile(path.join(outputRoot, "app-icon-512.png"), Buffer.from(iconDataUrl.split(",")[1], "base64"));
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #050505; color: #f5efe5; font-family: "Malgun Gothic", sans-serif; }
      main { width: 1024px; height: 500px; position: relative; overflow: hidden; padding: 64px 70px; border: 1px solid #2d2924; }
      main::before { content: ""; position: absolute; inset: 24px; border: 1px solid #26221e; pointer-events: none; }
      .copy { position: relative; z-index: 1; width: 620px; }
      .brand { margin: 0 0 32px; color: #c58d62; font-family: Georgia, serif; font-size: 28px; font-weight: 700; letter-spacing: 0; }
      h1 { margin: 0; max-width: 610px; font-family: Georgia, "Malgun Gothic", serif; font-size: 52px; font-weight: 700; line-height: 1.28; letter-spacing: 0; }
      p { margin: 28px 0 0; color: #b7aea2; font-size: 20px; line-height: 1.5; letter-spacing: 0; }
      .rule { width: 72px; height: 2px; margin-top: 34px; background: #c58d62; }
      img { position: absolute; z-index: 1; right: 48px; bottom: 42px; width: 270px; height: 270px; object-fit: contain; }
    </style>
    <main><div class="copy"><div class="brand">GLIM · 글림</div><h1>도파민에 지친 뇌를<br>쉬게 하는 텍스트 숏폼</h1><p>넘기기보다 머무는 문장, 조용히 이어지는 공감</p><div class="rule"></div></div><img src="${logoUrl}" alt=""></main>
  `);
  await page.screenshot({ path: path.join(outputRoot, "feature-graphic-1024x500.png") });
  await page.close();
}

async function createAppPage(browser, viewport, deviceScaleFactor) {
  const context = await browser.newContext({ viewport, deviceScaleFactor, colorScheme: "dark" });
  const page = await context.newPage();
  await page.addInitScript(supabaseBrowserStub);
  await page.route("**/*", (route) => route.request().url().startsWith(localUrl) ? route.continue() : route.abort());
  await page.goto(localUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.createContextFeedPost === "function");
  await page.evaluate(() => hideAppSplash({ force: true }));
  await page.locator("#appSplash").waitFor({ state: "detached" });
  await page.waitForFunction(() => !document.getElementById("postFeed")?.textContent.includes("불러오는 중"));
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}html{background:#050505!important}" });
  return { context, page };
}

async function showHome(page) {
  await page.evaluate((posts) => {
    document.querySelectorAll(".app-view").forEach((view) => view.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    document.getElementById("view-home").classList.add("active");
    document.getElementById("nav-home").classList.add("active");
    const cards = posts.map((post) => createContextFeedPost(post));
    document.getElementById("postFeed").replaceChildren(...cards);
    cards.forEach((card) => { fitPostTextToViewport(card); card.classList.add("is-visible"); });
    document.getElementById("view-home").scrollTop = 0;
  }, fixturePosts);
}

async function showExplore(page) {
  await page.evaluate((posts) => {
    document.querySelectorAll(".app-view").forEach((view) => view.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    document.getElementById("view-explore").classList.add("active");
    document.getElementById("nav-explore").classList.add("active");
    renderExploreMoodTabs();
    [["exploreHotRail", "store-hot", "오늘의 공감", "TODAY"], ["exploreAllTimeRail", "store-all", "오래 머문 문장", "ALL TIME"], ["exploreMoodRail", "store-mood", "사색 감성", "MOOD"]].forEach(([railId, contextKey, title, label]) => {
      renderExplorePostCollection({ rail: document.getElementById(railId), data: posts, error: null, contextKey, contextTitle: title, collectionLabel: label, emptyMessage: "아직 문장이 없어요." });
    });
    document.getElementById("view-explore").scrollTop = 0;
  }, fixturePosts);
}

async function showComments(page) {
  await showHome(page);
  await page.evaluate(() => {
    window.__supabaseRows.comments = [
      { id: "store-comment-1", post_id: "store-post-1", user_id: "comment-user-1", user_email: "글리머", content: "천천히 읽고 싶은 글이에요.", created_at: "2026-07-17T09:10:00Z", likes_count: 12 },
      { id: "store-comment-2", post_id: "store-post-1", user_id: "comment-user-2", user_email: "고요한밤", content: "@글리머 저도 같은 마음이에요.", created_at: "2026-07-17T09:12:00Z", likes_count: 5 },
      { id: "store-comment-3", post_id: "store-post-1", user_id: "comment-user-3", user_email: "마음한줄", content: "오늘은 여기서 잠깐 쉬어갈게요.", created_at: "2026-07-17T09:15:00Z", likes_count: 8 },
    ];
    openSheet("commentSheet", "store-post-1");
  });
  await page.locator("#commentSheet.open").waitFor();
  await page.locator("#commentList .comment-item").first().waitFor();
}

async function showProfile(page) {
  await page.evaluate(() => {
    document.querySelectorAll(".app-view").forEach((view) => view.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    document.getElementById("view-profile").classList.add("active");
    document.getElementById("nav-profile").classList.add("active");
    document.getElementById("authContainer").style.display = "block";
    document.getElementById("profileContainer").style.display = "none";
    document.getElementById("view-profile").scrollTop = 0;
  });
}

async function showProfileTab(page) {
  await page.evaluate((posts) => {
    document.querySelectorAll(".app-view").forEach((view) => view.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    document.getElementById("view-profile").classList.add("active");
    document.getElementById("nav-profile").classList.add("active");
    document.getElementById("authContainer").style.display = "none";
    document.getElementById("profileContainer").style.display = "block";

    const avatar = document.getElementById("profileAvatar");
    const avatarImage = new Image();
    avatarImage.src = "image/glimmer-profile-image.png";
    avatarImage.alt = "";
    avatarImage.style.cssText = "width:100%;height:100%;object-fit:cover;";
    avatar.replaceChildren(avatarImage);
    document.getElementById("profileName").innerText = "글리머";
    document.getElementById("profileId").innerText = "@" + "glimmer";
    const bio = document.getElementById("profileBio");
    bio.hidden = false;
    bio.innerText = "한 문장에 오래 머무는 사람";
    document.getElementById("statPosts").innerText = "6";
    document.getElementById("statFollowers").innerText = "128";
    document.getElementById("statFollowing").innerText = "64";

    const gridPosts = [...posts, ...posts.map((post, index) => ({ ...post, id: "profile-store-" + index }))];
    const grid = document.getElementById("profileGrid-my");
    grid.replaceChildren(...gridPosts.map((post, index) => createPostGridItem(post, index, "store-profile")));
    contextPostCollections.set("store-profile", gridPosts);
    contextPostTitles.set("store-profile", "내 게시물");
    document.getElementById("profileGridScroll").scrollLeft = 0;
    document.getElementById("view-profile").scrollTop = 0;
  }, fixturePosts);
}

async function showWrite(page) {
  await page.evaluate(() => {
    document.querySelectorAll(".app-view").forEach((view) => view.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    document.getElementById("view-write").classList.add("active");
    document.getElementById("nav-write").classList.add("active");
    document.getElementById("postContent").value = "오늘은 빠르게 지나가지 않고" + String.fromCharCode(10) + "내 마음의 속도를 따라가기로 했다.";
    document.getElementById("selectedMoodLabel").textContent = "사색";
    document.getElementById("selectedBgmLabel").textContent = "음악 없이 고요하게";
    updateCharCount();
    document.getElementById("view-write").scrollTop = 0;
  });
}

async function captureSet(browser, destinationRoot, folder, viewport, deviceScaleFactor, screens) {
  const target = path.join(destinationRoot, folder);
  await mkdir(target, { recursive: true });
  for (const [name, setup] of screens) {
    const { context, page } = await createAppPage(browser, viewport, deviceScaleFactor);
    await setup(page);
    await page.screenshot({ path: path.join(target, `${name}.png`) });
    await context.close();
  }
}

async function captureFramedMockup(browser, target, setup, outerViewport, deviceScaleFactor) {
  const deviceWidth = outerViewport.width - 50;
  const deviceHeight = outerViewport.height - 24;
  const screenWidth = deviceWidth - 56;
  const screenHeight = deviceHeight - 55;
  const statusHeight = 44;
  const { context, page } = await createAppPage(browser, { width: screenWidth, height: screenHeight - statusHeight }, deviceScaleFactor);
  await setup(page);
  const appScreenshot = await page.screenshot();
  await context.close();

  const frameContext = await browser.newContext({ viewport: outerViewport, deviceScaleFactor });
  const framePage = await frameContext.newPage();
  await framePage.setContent(String.raw`
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f4f7f9; }
      .device { position: absolute; inset: 12px 25px; padding: 28px; border-radius: 56px; background: #fbfbfb; box-shadow: 0 24px 52px rgba(20, 29, 38, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.95); }
      .screen { width: 100%; height: 100%; overflow: hidden; border-radius: 39px; background: #050505; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04); }
      .status { height: 44px; display: flex; align-items: center; justify-content: space-between; padding: 0 28px; background: #050505; color: #fff; font: 700 18px/1 Arial, sans-serif; }
      .status-right { display: flex; align-items: center; gap: 10px; }
      .signal { display: flex; align-items: end; gap: 3px; height: 16px; }
      .signal i { display: block; width: 4px; border-radius: 2px; background: #fff; }
      .signal i:nth-child(1) { height: 5px; } .signal i:nth-child(2) { height: 9px; } .signal i:nth-child(3) { height: 13px; } .signal i:nth-child(4) { height: 16px; }
      .wifi { width: 18px; height: 14px; border: 3px solid #fff; border-color: #fff transparent transparent transparent; border-radius: 50%; transform: rotate(180deg); }
      .battery { min-width: 34px; padding: 3px 5px; border-radius: 6px; background: #fff; color: #050505; font-size: 13px; text-align: center; }
      img { display: block; width: 100%; height: calc(100% - 44px); object-fit: cover; object-position: top; }
    </style>
    <div class="device"><div class="screen"><div class="status"><span>2:43</span><div class="status-right"><span class="signal"><i></i><i></i><i></i><i></i></span><span class="wifi"></span><span class="battery">88</span></div></div><img id="appImage" alt=""></div></div>
  `);
  await framePage.locator("#appImage").evaluate((image, data) => { image.src = data; }, "data:image/png;base64," + appScreenshot.toString("base64"));
  await framePage.screenshot({ path: target });
  await frameContext.close();
}

async function captureFramedSet(browser, folder, outerViewport, deviceScaleFactor, screens) {
  const target = path.join(mockupOutputRoot, folder);
  await mkdir(target, { recursive: true });
  for (const [name, setup] of screens) {
    await captureFramedMockup(browser, path.join(target, name + ".png"), setup, outerViewport, deviceScaleFactor);
  }
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await rm(mockupOutputRoot, { recursive: true, force: true });
await mkdir(mockupOutputRoot, { recursive: true });
const server = spawn(process.execPath, ["scripts/static-server.mjs", "--host", "127.0.0.1", "--port", "4173"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
server.stderr.pipe(process.stderr);
let browser;
try {
  await waitForServer(server);
  browser = await chromium.launch({ channel: "chrome" });
  await createBrandAssets(browser);
  await captureSet(browser, outputRoot, "phone", { width: 360, height: 640 }, 3, [["01-home", showHome], ["02-explore", showExplore], ["03-comments", showComments]]);
  await captureSet(browser, outputRoot, "phone", { width: 432, height: 768 }, 2.5, [["04-profile-login", showProfile]]);
  await captureSet(browser, outputRoot, "tablet-7", { width: 1200, height: 675 }, 2, [["01-explore", showExplore], ["02-comments", showComments]]);
  await captureSet(browser, outputRoot, "tablet-10", { width: 1600, height: 900 }, 2, [["01-explore", showExplore], ["02-comments", showComments]]);
  const mockupScreens = [["01-home", showHome], ["02-explore", showExplore], ["03-profile", showProfileTab], ["04-write", showWrite]];
  await captureSet(browser, mockupOutputRoot, "7-inch", { width: 1200, height: 675 }, 2, mockupScreens);
  await captureSet(browser, mockupOutputRoot, "10-inch", { width: 1600, height: 900 }, 2, mockupScreens);
} finally {
  await browser?.close();
  await terminateOwnedProcessTree(server);
}

import { expect, test } from "@playwright/test";
import { supabaseBrowserStub } from "../security/fixtures/supabase-browser-stub.mjs";

test("serves the Korean application shell and runtime assets", async ({
  page,
  request,
}) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) =>
    route.abort(),
  );

  const response = await page.goto("/", {
    timeout: 10_000,
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("글림 - 텍스트 숏폼");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.locator("#view-home")).toHaveClass(/active/);

  const manifest = await request.get("/manifest.json");
  expect(manifest.status()).toBe(200);
  expect(manifest.headers()["content-type"]).toContain("application/json");

  const logo = await request.get("/image/app-logo.png");
  expect(logo.status()).toBe(200);
  expect(logo.headers()["content-type"]).toBe("image/png");
});

test("updates the write counter for English letters and numbers", async ({
  page,
}) => {
  await page.addInitScript(supabaseBrowserStub);
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (!url.startsWith("http://127.0.0.1:4173/")) {
      route.abort();
      return;
    }
    route.continue();
  });

  await page.goto("/", {
    timeout: 10_000,
    waitUntil: "domcontentloaded",
  });
  await page.evaluate(() => {
    document
      .querySelectorAll(".app-view")
      .forEach((view) => view.classList.remove("active"));
    document.getElementById("view-write").classList.add("active");
  });

  await page.locator("#postContent").click();
  await page.keyboard.type("abc123");
  await expect(page.locator("#charCount")).toContainText("6 / 120");
});


test("uses the RLS profile nickname for post and comment inserts", async ({
  page,
}) => {
  await page.addInitScript(supabaseBrowserStub);
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (!url.startsWith("http://127.0.0.1:4173/")) {
      route.abort();
      return;
    }
    route.continue();
  });

  await page.goto("/", {
    timeout: 10_000,
    waitUntil: "domcontentloaded",
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__authCallback)))
    .toBe(true);

  await page.evaluate(async () => {
    window.__ugcAccepted = true;
    window.__supabaseRows.profiles = [{
      id: "rls-author-fixture",
      nickname: "DB작성자",
      custom_id: "dbwriter",
      avatar_url: "",
      bio: "",
      theme: "default",
      updated_at: "2026-07-08T00:00:00Z",
    }];
    await window.__emitAuth({
      user: {
        id: "rls-author-fixture",
        email: "rls@example.test",
        user_metadata: { random_nickname: "낡은닉네임", custom_id: "oldid" },
      },
    });
  });

  await page.evaluate(() => {
    switchTab("write");
    document.getElementById("postContent").value = "영어123 테스트 글";
    document.getElementById("postMood").value = "사색";
  });
  await page.evaluate(() => submitPost());

  await page.evaluate(() => {
    const post = document.createElement("div");
    post.className = "post";
    post.dataset.postId = "comment-target-fixture";
    post.innerHTML = '<div class="author-name">원글작성자</div><div class="text-content">댓글을 달 원문 내용</div>';
    document.body.append(post);
    openSheet("commentSheet", "comment-target-fixture");
    document.getElementById("commentInput").value = "좋은 댓글입니다";
  });
  await page.evaluate(() => submitComment());

  const inserts = await page.evaluate(() => ({
    posts: window.__supabaseCalls
      .filter((call) => call.boundary === "table" && call.name === "posts.insert")
      .map((call) => call.detail?.[0]),
    comments: window.__supabaseCalls
      .filter((call) => call.boundary === "table" && call.name === "comments.insert")
      .map((call) => call.detail?.[0]),
  }));

  expect(inserts.posts.at(-1)).toMatchObject({ author: "DB작성자" });
  expect(inserts.comments.at(-1)).toMatchObject({ user_email: "DB작성자" });
});


test("shows the source post preview and focused comment sheet state", async ({
  page,
}) => {
  await page.addInitScript(supabaseBrowserStub);
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (!url.startsWith("http://127.0.0.1:4173/")) {
      route.abort();
      return;
    }
    route.continue();
  });

  await page.goto("/", {
    timeout: 10_000,
    waitUntil: "domcontentloaded",
  });

  await page.evaluate(() => {
    const post = document.createElement("div");
    post.className = "post";
    post.dataset.postId = "comment-preview-fixture";
    post.innerHTML = '<div class="author-name">미리보기 작성자</div><div class="text-content">댓글 시트에서 보여줄 원문입니다.</div>';
    document.body.append(post);
    window.__supabaseRows.comments = [{
      id: "comment-row-fixture",
      post_id: "comment-preview-fixture",
      user_id: "commenter-fixture",
      user_email: "기존작성자",
      content: "기존 댓글",
      created_at: "2026-07-08T00:00:00Z",
      likes_count: 0,
    }];
    openSheet("commentSheet", "comment-preview-fixture");
  });

  await expect(page.locator("#commentPostPreview")).toBeVisible();
  await expect(page.locator("#commentPostPreviewAuthor")).toContainText("미리보기 작성자");
  await expect(page.locator("#commentPostPreviewContent")).toContainText("댓글 시트에서 보여줄 원문");

  const layout = await page.evaluate(() => {
    const sheet = document.getElementById("commentSheet").getBoundingClientRect();
    const preview = document.getElementById("commentPostPreview").getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      sheetTop: sheet.top,
      sheetHeight: sheet.height,
      previewBottom: preview.bottom,
    };
  });
  expect(layout.sheetHeight / layout.viewportHeight).toBeGreaterThan(0.52);
  expect(layout.sheetHeight / layout.viewportHeight).toBeLessThan(0.58);
  expect(layout.previewBottom).toBeLessThanOrEqual(layout.sheetTop - 6);

  await page.locator("#commentInput").focus();
  await expect(page.locator("#commentSheet")).toHaveClass(/is-input-focused/);
  await expect(page.locator("#commentPostPreview")).toHaveClass(/is-input-focused/);
  await expect(page.locator("#commentList")).toContainText("기존 댓글");
});


test("recovers enabled push status from the current user's active remote subscription", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { permission: "granted", requestPermission: async () => "granted" },
    });
    Object.defineProperty(window, "PushManager", {
      configurable: true,
      value: function PushManager() {},
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register: async () => ({}) },
    });
  });
  await page.addInitScript(supabaseBrowserStub);
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (!url.startsWith("http://127.0.0.1:4173/")) {
      route.abort();
      return;
    }
    route.continue();
  });

  await page.goto("/", {
    timeout: 10_000,
    waitUntil: "domcontentloaded",
  });

  await page.evaluate(async () => {
    window.__supabaseRows.push_subscriptions = [{
      user_id: "push-user-fixture",
      firebase_installation_id: "remote-fid-fixture",
      enabled: true,
      updated_at: "2026-07-08T00:00:00Z",
    }];
    await window.__emitAuth({
      user: {
        id: "push-user-fixture",
        email: "push@example.test",
        user_metadata: { random_nickname: "푸시 사용자" },
      },
    });
    localStorage.removeItem("glim_push_fid_push-user-fixture");
    activateAppView("view-notification-settings");
    updatePushNotificationSettingsUI();
  });

  await expect.poll(() => page.locator("#pushNotificationToggle").isChecked()).toBe(true);
  await expect(page.locator("#pushNotificationStatus")).toContainText("켜짐");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("glim_push_fid_push-user-fixture")))
    .toBe("remote-fid-fixture");
});


test("normalizes legacy profile themes to default before swipe reveal", async ({
  page,
}) => {
  await page.addInitScript(supabaseBrowserStub);
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (!url.startsWith("http://127.0.0.1:4173/")) {
      route.abort();
      return;
    }
    route.continue();
  });

  await page.goto("/", {
    timeout: 10_000,
    waitUntil: "domcontentloaded",
  });

  await page.evaluate(async () => {
    localStorage.setItem("glim_pending_ugc_policy_acceptance", "1");
    window.__supabaseRows.profiles = [{
      id: "theme-user-fixture",
      nickname: "테마 사용자",
      custom_id: "themeuser",
      avatar_url: "",
      bio: "기본 테마만 사용",
      theme: "lofi_night",
      updated_at: "2026-07-08T00:00:00Z",
    }];
    await window.__emitAuth({
      user: {
        id: "theme-user-fixture",
        email: "theme@example.test",
        user_metadata: { random_nickname: "테마 사용자" },
      },
    });
    switchTab("profile");
  });

  await expect(page.locator("#view-profile")).toHaveClass(/profile-theme-default/);
  await expect(page.locator("#view-profile")).not.toHaveClass(/profile-theme-lofi-night|profile-theme-vintage-analog/);
  await expect(page.locator("#profileBio")).toContainText("기본 테마만 사용");
  await expect
    .poll(() =>
      page.locator("#view-profile").evaluate((view) => getComputedStyle(view).backgroundImage),
    )
    .toBe("none");

  const refreshed = await page.evaluate(() => {
    const authContainer = document.getElementById("authContainer");
    const profileContainer = document.getElementById("profileContainer");
    authContainer.style.display = "block";
    profileContainer.style.display = "none";
    prepareSwipeBackUnderlay(document.getElementById("view-profile"));
    return {
      authDisplay: authContainer.style.display,
      profileDisplay: profileContainer.style.display,
    };
  });

  expect(refreshed).toEqual({ authDisplay: "none", profileDisplay: "block" });
});


test("requires policy agreement before social login and stores it after auth", async ({
  page,
}) => {
  await page.addInitScript(supabaseBrowserStub);
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (!url.startsWith("http://127.0.0.1:4173/")) {
      route.abort();
      return;
    }
    route.continue();
  });

  await page.goto("/", {
    timeout: 10_000,
    waitUntil: "domcontentloaded",
  });
  await page.evaluate(() => activateAppView("view-profile"));

  await page.getByText("Google로 계속하기").click();
  await expect(page.locator("#appAlert")).toHaveClass(/open/);
  await expect(page.locator("#appAlertMessage")).toContainText("커뮤니티 기준");
  await page.locator("[data-app-alert-primary]").click();
  await expect
    .poll(() => page.evaluate(() => window.__oauthProvider))
    .toBe("google");

  await page.evaluate(() =>
    window.__emitAuth({
      user: {
        id: "new-user-fixture",
        email: "new@example.test",
        user_metadata: { random_nickname: "새 글리머" },
      },
    }),
  );

  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__supabaseCalls.some(
          (call) => call.boundary === "rpc" && call.name === "accept_current_ugc_policy",
        ),
      ),
    )
    .toBe(true);
});

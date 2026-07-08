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
    document.getElementById("commentInput").textContent = "좋은 댓글입니다";
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


test("keeps the second home feed post above the comment sheet", async ({
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
    .poll(() => page.evaluate(() => window.__supabaseCalls.some(
      (call) => call.boundary === "table" && call.name === "posts.select",
    )))
    .toBe(true);

  await page.evaluate(() => {
    const feed = document.getElementById("postFeed");
    const posts = [1, 2, 3].map((index) => createContextFeedPost({
      id: "home-comment-source-" + index,
      user_id: "home-comment-author-" + index,
      author: "홈작성자" + index,
      content: "홈 피드 " + index + "번째 댓글 원문입니다.",
      created_at: "2026-07-08T00:00:00Z",
      likes_count: 0,
      dislikes_count: 0,
    }));
    feed.replaceChildren(...posts);
    posts.forEach((post) => fitPostTextToViewport(post));
    document.querySelectorAll(".app-view").forEach((view) => view.classList.remove("active"));
    document.getElementById("view-home").classList.add("active");
    window.__supabaseRows.comments = [{
      id: "home-comment-row-fixture",
      post_id: "home-comment-source-2",
      user_id: "commenter-fixture",
      user_email: "기존작성자",
      content: "기존 댓글",
      created_at: "2026-07-08T00:00:00Z",
      likes_count: 0,
    }];
  });

  const beforeScrollTop = await page.evaluate(() => {
    const view = document.getElementById("view-home");
    const target = document.querySelector('#postFeed .post[data-post-id="home-comment-source-2"]');
    view.scrollTop = target.offsetTop;
    return view.scrollTop;
  });
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    document
      .querySelector('#postFeed .post[data-post-id="home-comment-source-2"] [data-post-action="comment"]')
      ?.click();
  });
  await expect(page.locator("#commentSheet")).toHaveClass(/open/);
  await expect(page.locator("#commentList")).toContainText("기존 댓글");
  await page.waitForTimeout(700);

  const layout = await page.evaluate(() => {
    const post = document.querySelector('#postFeed .post[data-post-id="home-comment-source-2"]');
    const rect = post.getBoundingClientRect();
    const sheet = document.getElementById("commentSheet").getBoundingClientRect();
    return {
      className: post.className,
      sourceY: parseFloat(post.style.getPropertyValue("--comment-source-y")) || 0,
      sourceCenter: rect.top + rect.height / 2,
      sheetTop: sheet.top,
      scrollTop: document.getElementById("view-home").scrollTop,
      backgroundColor: getComputedStyle(post).backgroundColor,
      textOpacity: getComputedStyle(post.querySelector(".text-content")).opacity,
      authorOpacity: getComputedStyle(post.querySelector(".author-info")).opacity,
    };
  });

  expect(layout.className).toContain("is-comment-source");
  expect(layout.sourceY).toBeLessThan(-1);
  expect(layout.sourceCenter).toBeLessThan(layout.sheetTop - 70);
  expect(layout.scrollTop).toBeGreaterThanOrEqual(beforeScrollTop);
  expect(layout.backgroundColor).toBe("rgb(5, 5, 5)");
  expect(layout.textOpacity).toBe("1");
  expect(layout.authorOpacity).toBe("1");
});


test("keeps the real source post singular while the comment sheet is dragged", async ({
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
    const homeFeed = document.getElementById("postFeed");
    const hiddenHomePost = createContextFeedPost({
      id: "comment-preview-fixture",
      user_id: "comment-author-fixture",
      author: "숨겨진 홈 작성자",
      content: "활성 화면이 아닌 홈 피드 사본입니다.",
      created_at: "2026-07-08T00:00:00Z",
      likes_count: 0,
      dislikes_count: 0,
    });
    homeFeed.replaceChildren(hiddenHomePost);
    fitPostTextToViewport(hiddenHomePost);

    const contextFeed = document.getElementById("contextPostFeed");
    const visibleContextPost = createContextFeedPost({
      id: "comment-preview-fixture",
      user_id: "comment-author-fixture",
      author: "미리보기 작성자",
      content: "댓글 시트에서 보여줄 원문입니다.",
      created_at: "2026-07-08T00:00:00Z",
      likes_count: 0,
      dislikes_count: 0,
    });
    contextFeed.replaceChildren(visibleContextPost);
    fitPostTextToViewport(visibleContextPost);
    document.querySelectorAll(".app-view").forEach((view) => view.classList.remove("active"));
    document.getElementById("view-context-feed").classList.add("active");
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

  await expect(page.locator("#commentPostPreview")).toHaveCount(0);
  await expect(page.locator(".comment-post-clone")).toHaveCount(0);
  const sourcePost = page.locator('#view-context-feed .post[data-post-id="comment-preview-fixture"]');
  const hiddenSourcePost = page.locator('#view-home .post[data-post-id="comment-preview-fixture"]');
  await expect(sourcePost).toHaveCount(1);
  await expect(hiddenSourcePost).toHaveCount(1);
  await expect(sourcePost).toHaveClass(/is-comment-source/);
  await expect(hiddenSourcePost).not.toHaveClass(/is-comment-source/);
  await expect(page.locator("#commentSheet")).toHaveClass(/open/);
  await expect(page.locator("#commentList")).toContainText("기존 댓글");
  await page.waitForTimeout(620);

  const layout = await page.evaluate(() => {
    const sheet = document.getElementById("commentSheet").getBoundingClientRect();
    return {
      viewportHeight: window.innerHeight,
      sheetTop: sheet.top,
      sheetHeight: sheet.height,
      sourcePostCount: document.querySelectorAll('#view-context-feed .post[data-post-id="comment-preview-fixture"]').length,
      sourceY: parseFloat(document.querySelector('#view-context-feed .post[data-post-id="comment-preview-fixture"]')?.style.getPropertyValue("--comment-source-y")) || 0,
      sourceScale: parseFloat(document.querySelector('#view-context-feed .post[data-post-id="comment-preview-fixture"]')?.style.getPropertyValue("--comment-source-scale")) || 1,
      sourceRect: (() => {
        const rect = document.querySelector('#view-context-feed .post[data-post-id="comment-preview-fixture"]')?.getBoundingClientRect();
        return rect ? { top: rect.top, bottom: rect.bottom, center: rect.top + rect.height / 2 } : null;
      })(),
      cloneCount: document.querySelectorAll(".comment-post-clone").length,
    };
  });
  expect(layout.sourcePostCount).toBe(1);
  expect(layout.cloneCount).toBe(0);
  expect(layout.sourceY).toBeLessThan(-layout.viewportHeight * 0.2);
  expect(layout.sourceScale).toBe(1);
  expect(layout.sourceRect.center).toBeLessThan(layout.sheetTop - 70);
  expect(layout.sheetHeight / layout.viewportHeight).toBeGreaterThan(0.52);
  expect(layout.sheetHeight / layout.viewportHeight).toBeLessThan(0.58);

  await page.locator("#commentInput").focus();
  await expect(page.locator("#commentSheet")).toHaveClass(/is-input-focused/);
  await expect(page.locator("#commentPostPreview")).toHaveCount(0);
  await page.waitForTimeout(620);

  const focusedLayout = await page.evaluate(() => {
    const sheet = document.getElementById("commentSheet").getBoundingClientRect();
    return {
      sheetTop: sheet.top,
      sheetHeight: sheet.height,
      sourcePostCount: document.querySelectorAll('#view-context-feed .post[data-post-id="comment-preview-fixture"]').length,
      sourceY: parseFloat(document.querySelector('#view-context-feed .post[data-post-id="comment-preview-fixture"]')?.style.getPropertyValue("--comment-source-y")) || 0,
      sourceScale: parseFloat(document.querySelector('#view-context-feed .post[data-post-id="comment-preview-fixture"]')?.style.getPropertyValue("--comment-source-scale")) || 1,
      sourceRect: (() => {
        const rect = document.querySelector('#view-context-feed .post[data-post-id="comment-preview-fixture"]')?.getBoundingClientRect();
        return rect ? { top: rect.top, bottom: rect.bottom, center: rect.top + rect.height / 2 } : null;
      })(),
      cloneCount: document.querySelectorAll(".comment-post-clone").length,
    };
  });
  expect(focusedLayout.sourcePostCount).toBe(1);
  expect(focusedLayout.cloneCount).toBe(0);
  expect(focusedLayout.sourceY).toBeLessThan(layout.sourceY - 16);
  expect(focusedLayout.sourceScale).toBeLessThan(1);
  expect(focusedLayout.sourceRect.center).toBeLessThan(layout.sourceRect.center - 10);
  expect(focusedLayout.sheetHeight).toBeGreaterThan(layout.sheetHeight + 12);
  expect(focusedLayout.sheetTop).toBeLessThan(layout.sheetTop - 12);

  const dragStart = await page.evaluate(() => {
    const input = document.getElementById("commentInput").getBoundingClientRect();
    return { x: input.left + input.width / 2, y: input.top + input.height / 2 };
  });
  await page.evaluate(({ x, y }) => {
    const input = document.getElementById("commentInput");
    const pointerId = 42;
    const dispatchDragEvent = (type, clientY) => {
      input.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY,
        pointerId,
        pointerType: "touch",
        isPrimary: true,
      }));
    };
    dispatchDragEvent("pointerdown", y);
    [15, 30, 45, 60, 75, 90, 105, 120].forEach((delta) => {
      dispatchDragEvent("pointermove", y + delta);
    });
  }, dragStart);

  const draggingLayout = await page.evaluate(() => {
    const sheet = document.getElementById("commentSheet");
    const box = sheet.getBoundingClientRect();
    return {
      sheetTop: box.top,
      sheetHeight: box.height,
      dragOffset: parseFloat(sheet.style.getPropertyValue("--comment-sheet-drag")) || 0,
      sourcePostCount: document.querySelectorAll('#view-context-feed .post[data-post-id="comment-preview-fixture"]').length,
      sourceY: parseFloat(document.querySelector('#view-context-feed .post[data-post-id="comment-preview-fixture"]')?.style.getPropertyValue("--comment-source-y")) || 0,
      sourceScale: parseFloat(document.querySelector('#view-context-feed .post[data-post-id="comment-preview-fixture"]')?.style.getPropertyValue("--comment-source-scale")) || 1,
      sourceRect: (() => {
        const rect = document.querySelector('#view-context-feed .post[data-post-id="comment-preview-fixture"]')?.getBoundingClientRect();
        return rect ? { top: rect.top, bottom: rect.bottom, center: rect.top + rect.height / 2 } : null;
      })(),
      cloneCount: document.querySelectorAll(".comment-post-clone").length,
    };
  });
  expect(draggingLayout.sheetTop).toBeGreaterThan(focusedLayout.sheetTop + 20);
  expect(draggingLayout.dragOffset).toBeGreaterThan(20);
  const sheetDragDelta = draggingLayout.sheetTop - focusedLayout.sheetTop;
  const sourceDragDelta = draggingLayout.sourceRect.center - focusedLayout.sourceRect.center;
  expect(draggingLayout.sourceY).toBeGreaterThan(focusedLayout.sourceY + 10);
  expect(draggingLayout.sourceScale).toBeGreaterThanOrEqual(focusedLayout.sourceScale);
  expect(draggingLayout.sourceRect.center).toBeGreaterThan(focusedLayout.sourceRect.center + 10);
  expect(Math.abs(sourceDragDelta - sheetDragDelta)).toBeLessThan(6);
  expect(draggingLayout.sourcePostCount).toBe(1);
  expect(draggingLayout.cloneCount).toBe(0);

  await page.evaluate(({ x, y }) => {
    document.getElementById("commentInput").dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y + 120,
      pointerId: 42,
      pointerType: "touch",
      isPrimary: true,
    }));
  }, dragStart);
  await expect(page.locator("#commentSheet")).not.toHaveClass(/is-input-focused/);
  await page.waitForTimeout(620);

  const restoredLayout = await page.evaluate(() => {
    const sheet = document.getElementById("commentSheet").getBoundingClientRect();
    return {
      sheetTop: sheet.top,
      sheetHeight: sheet.height,
      sourcePostCount: document.querySelectorAll('#view-context-feed .post[data-post-id="comment-preview-fixture"]').length,
      sourceY: parseFloat(document.querySelector('#view-context-feed .post[data-post-id="comment-preview-fixture"]')?.style.getPropertyValue("--comment-source-y")) || 0,
      sourceScale: parseFloat(document.querySelector('#view-context-feed .post[data-post-id="comment-preview-fixture"]')?.style.getPropertyValue("--comment-source-scale")) || 1,
      sourceRect: (() => {
        const rect = document.querySelector('#view-context-feed .post[data-post-id="comment-preview-fixture"]')?.getBoundingClientRect();
        return rect ? { top: rect.top, bottom: rect.bottom, center: rect.top + rect.height / 2 } : null;
      })(),
      cloneCount: document.querySelectorAll(".comment-post-clone").length,
    };
  });
  expect(restoredLayout.sheetHeight).toBeLessThan(focusedLayout.sheetHeight - 12);
  expect(restoredLayout.sheetTop).toBeGreaterThan(focusedLayout.sheetTop + 12);
  expect(restoredLayout.sourcePostCount).toBe(1);
  expect(restoredLayout.cloneCount).toBe(0);
  expect(Math.abs(restoredLayout.sourceY - layout.sourceY)).toBeLessThan(2);
  expect(restoredLayout.sourceScale).toBe(1);
  expect(Math.abs(restoredLayout.sourceRect.center - layout.sourceRect.center)).toBeLessThan(2);
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

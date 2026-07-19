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

test("opens the public privacy policy without signing in", async ({ page }) => {
  await page.addInitScript(supabaseBrowserStub);
  await page.route("**/*", (route) => {
    if (!route.request().url().startsWith("http://127.0.0.1:4173/")) {
      route.abort();
      return;
    }
    route.continue();
  });

  const response = await page.goto("/?view=privacy-policy", {
    timeout: 10_000,
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await expect(page.locator("#view-privacy-policy")).toHaveClass(/active/);
  await expect(page.locator("#view-privacy-policy h1")).toHaveText("개인정보 처리방침");
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


test("shows reply comments oldest first with the newest at the bottom", async ({
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
    window.__supabaseRows.comments = [
      {
        id: "reply-newer-fixture",
        post_id: "reply-order-post",
        user_id: "reply-user-new",
        user_email: "새답글작성자",
        content: "@원댓글작성자 나중에 단 답글",
        created_at: "2026-07-08T00:02:00Z",
        likes_count: 0,
      },
      {
        id: "reply-older-fixture",
        post_id: "reply-order-post",
        user_id: "reply-user-old",
        user_email: "첫답글작성자",
        content: "@원댓글작성자 먼저 단 답글",
        created_at: "2026-07-08T00:01:00Z",
        likes_count: 0,
      },
      {
        id: "plain-comment-fixture",
        post_id: "reply-order-post",
        user_id: "plain-user",
        user_email: "원댓글작성자",
        content: "원댓글",
        created_at: "2026-07-08T00:00:00Z",
        likes_count: 0,
      },
    ];
    openSheet("commentSheet", "reply-order-post");
  });

  await expect(page.locator("#commentList .comment-item.is-reply-comment")).toHaveCount(2);
  await expect
    .poll(() =>
      page.locator("#commentList .comment-item.is-reply-comment .comment-text").allTextContents(),
    )
    .toEqual(["먼저 단 답글", "나중에 단 답글"]);
});


test("keeps the second home feed post above the comment sheet", async ({
  page,
}) => {
  await page.addInitScript(supabaseBrowserStub);
  await page.addInitScript(() => {
    localStorage.setItem("glim_theme_preference", "dark");
  });
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

  await page.mouse.click(190, 80);
  await expect(page.locator("#commentSheet")).not.toHaveClass(/open/);
  await expect(page.locator("#commentSheetBackdrop")).not.toHaveClass(/open/);
  await expect(page.locator('#postFeed .post[data-post-id="home-comment-source-2"]'))
    .not.toHaveClass(/is-comment-source/);
});


test("keeps the real source post singular while the comment sheet is dragged", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
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
  expect(layout.sourceY).toBeLessThan(-layout.viewportHeight * 0.1);
  expect(layout.sourceY).toBeGreaterThan(-layout.viewportHeight * 0.16);
  expect(layout.sourceScale).toBe(1);
  expect(layout.sourceRect.center).toBeGreaterThan(layout.viewportHeight * 0.25);
  expect(layout.sourceRect.center).toBeLessThan(layout.sheetTop - 70);
  expect(layout.sheetHeight / layout.viewportHeight).toBeGreaterThan(0.48);
  expect(layout.sheetHeight / layout.viewportHeight).toBeLessThan(0.52);

  const handleDragStart = await page.evaluate(() => {
    const handle = document.querySelector("#commentSheet .sheet-handle").getBoundingClientRect();
    return { x: handle.left + handle.width / 2, y: handle.top + handle.height / 2 };
  });
  await page.evaluate(({ x, y }) => {
    const handle = document.querySelector("#commentSheet .sheet-handle");
    const pointerId = 41;
    const dispatchDragEvent = (type, clientY) => {
      handle.dispatchEvent(new PointerEvent(type, {
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
    [18, 36, 54, 72].forEach((delta) => dispatchDragEvent("pointermove", y + delta));
  }, handleDragStart);

  const restDraggingLayout = await page.evaluate(() => {
    const sheet = document.getElementById("commentSheet");
    const box = sheet.getBoundingClientRect();
    const sourceRect = document
      .querySelector('#view-context-feed .post[data-post-id="comment-preview-fixture"]')
      .getBoundingClientRect();
    return {
      sheetTop: box.top,
      dragOffset: parseFloat(sheet.style.getPropertyValue("--comment-sheet-drag")) || 0,
      sourceCenter: sourceRect.top + sourceRect.height / 2,
    };
  });
  const restSheetDragDelta = restDraggingLayout.sheetTop - layout.sheetTop;
  const restSourceDragDelta = restDraggingLayout.sourceCenter - layout.sourceRect.center;
  expect(restDraggingLayout.dragOffset).toBeGreaterThan(12);
  expect(restSheetDragDelta).toBeGreaterThan(12);
  expect(Math.abs(restSourceDragDelta - restSheetDragDelta)).toBeLessThan(6);

  await page.evaluate(({ x, y }) => {
    document.querySelector("#commentSheet .sheet-handle").dispatchEvent(new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y + 72,
      pointerId: 41,
      pointerType: "touch",
      isPrimary: true,
    }));
  }, handleDragStart);
  await page.waitForTimeout(620);

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
      inputBottomGap: (() => {
        const input = document.getElementById("commentInput")?.getBoundingClientRect();
        return input ? Math.round(sheet.bottom - input.bottom) : null;
      })(),
      cloneCount: document.querySelectorAll(".comment-post-clone").length,
    };
  });
  expect(focusedLayout.sourcePostCount).toBe(1);
  expect(focusedLayout.cloneCount).toBe(0);
  expect(focusedLayout.sourceY).toBeLessThan(layout.sourceY - 8);
  expect(focusedLayout.sourceScale).toBeLessThan(1);
  expect(focusedLayout.sourceRect.center).toBeLessThan(layout.sourceRect.center - 6);
  expect(focusedLayout.sheetHeight).toBeGreaterThan(layout.sheetHeight + 12);
  expect(focusedLayout.sheetTop).toBeLessThan(layout.sheetTop - 12);
  expect(focusedLayout.inputBottomGap).toBeGreaterThanOrEqual(7);
  expect(focusedLayout.inputBottomGap).toBeLessThanOrEqual(18);

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
  expect(Math.abs(sourceDragDelta - sheetDragDelta)).toBeLessThan(10);
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
  expect(Math.abs(restoredLayout.sourceY - layout.sourceY)).toBeLessThan(6);
  expect(restoredLayout.sourceScale).toBe(1);
  expect(Math.abs(restoredLayout.sourceRect.center - layout.sourceRect.center)).toBeLessThan(6);
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


test("routes the Android system back gesture through app navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(supabaseBrowserStub);
  await page.addInitScript(() => {
    const listeners = {};
    window.__nativeAppListeners = listeners;
    window.__nativeExitCount = 0;
    window.Capacitor = {
      getPlatform: () => "android",
      isNativePlatform: () => true,
      Plugins: {
        App: {
          addListener: async (name, listener) => {
            listeners[name] = listener;
            return { remove: async () => {} };
          },
          getLaunchUrl: async () => undefined,
          exitApp: async () => {
            window.__nativeExitCount += 1;
          },
        },
      },
    };
  });
  await page.route("**/*", (route) => {
    if (!route.request().url().startsWith("http://127.0.0.1:4173/")) {
      route.abort();
      return;
    }
    route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__nativeAppListeners.backButton)))
    .toBe(true);

  await page.evaluate(() => {
    document.getElementById("commentSheet").classList.add("open");
    showAppAlert("Back priority fixture");
    window.__nativeAppListeners.backButton();
  });
  await expect(page.locator("#appAlert")).not.toHaveClass(/open/);
  await expect(page.locator("#commentSheet")).toHaveClass(/open/);

  await page.evaluate(() => {
    document.getElementById("reportSheet").classList.add("open");
    window.__nativeAppListeners.backButton();
  });
  await expect(page.locator("#reportSheet")).not.toHaveClass(/open/);
  await expect(page.locator("#commentSheet")).toHaveClass(/open/);

  await page.evaluate(() => {
    window.__nativeAppListeners.backButton();
  });
  await expect(page.locator("#commentSheet")).not.toHaveClass(/open/);

  await page.evaluate(() => {
    const menu = document.createElement("div");
    menu.id = "nativeBackMenuFixture";
    menu.className = "more-menu show";
    document.body.append(menu);
    window.__nativeAppListeners.backButton();
  });
  await expect(page.locator("#nativeBackMenuFixture")).not.toHaveClass(/show/);

  await page.evaluate(() => {
    activateAppView("view-explore");
    openExploreSearch();
    window.__nativeAppListeners.backButton();
  });
  await expect(page.locator("#exploreHeader")).not.toHaveClass(/is-searching/);

  await page.evaluate(() => {
    activateAppView("view-explore");
    openExploreSearch();
    userProfileReturnViewId = "view-explore";
    activateAppView("view-user-profile");
    window.__nativeAppListeners.backButton();
  });
  await expect(page.locator("#view-explore")).toHaveClass(/active/);
  await expect(page.locator("#exploreHeader")).toHaveClass(/is-searching/);

  await page.evaluate(() => {
    window.__nativeAppListeners.backButton();
  });
  await expect(page.locator("#exploreHeader")).not.toHaveClass(/is-searching/);

  await page.evaluate(() => {
    activateAppView("view-account-center");
    openAccountDeleteView();
    window.__nativeAppListeners.backButton();
  });
  await expect(page.locator("#view-account-center")).toHaveClass(/active/);
  await expect
    .poll(() => page.evaluate(() => window.__nativeExitCount))
    .toBe(0);

  await page.evaluate(() => {
    activateAppView("view-settings");
    window.__nativeAppListeners.backButton();
  });
  await expect(page.locator("#view-profile")).toHaveClass(/active/);

  await page.evaluate(() => {
    window.__nativeAppListeners.backButton();
  });
  await expect(page.locator("#view-home")).toHaveClass(/active/);

  await page.evaluate(() => {
    window.__nativeAppListeners.backButton();
  });
  await expect
    .poll(() => page.evaluate(() => window.__nativeExitCount))
    .toBe(1);
});

test("keeps the Explore search header fixed and refresh indicator near the top", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(supabaseBrowserStub);
  await page.route("**/*", (route) => {
    if (!route.request().url().startsWith("http://127.0.0.1:4173/")) {
      route.abort();
      return;
    }
    route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__authCallback)))
    .toBe(true);
  await page.waitForTimeout(50);

  const pullState = await page.evaluate(async () => {
    activateAppView("view-explore");
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const view = document.getElementById("view-explore");
    const header = document.getElementById("exploreHeader");
    const indicator = document.getElementById("refreshIndicator");
    view.scrollTop = 0;

    const emitTouch = (type, y) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      const touches = type === "touchcancel" ? [] : [{ clientX: 120, clientY: y }];
      Object.defineProperty(event, "touches", { value: touches });
      view.dispatchEvent(event);
    };

    const inspectPull = async (contentId) => {
      const content = document.getElementById(contentId);
      const headerTopBefore = header.getBoundingClientRect().top;
      emitTouch("touchstart", 100);
      emitTouch("touchmove", 190);
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      const state = {
        headerTopBefore,
        headerTopAfter: header.getBoundingClientRect().top,
        indicatorTop: Number.parseFloat(getComputedStyle(indicator).top),
        contentTransform: getComputedStyle(content).transform,
      };
      emitTouch("touchcancel", 190);
      return state;
    };

    const discovery = await inspectPull("exploreDiscoveryContent");
    openExploreSearch();
    const search = await inspectPull("exploreSearchContent");
    emitTouch("touchstart", 100);
    emitTouch("touchmove", 190);
    window.dispatchEvent(new Event("blur"));
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    return {
      pullStates: [discovery, search],
      interruptedTransform: getComputedStyle(
        document.getElementById("exploreSearchContent"),
      ).transform,
    };
  });

  for (const state of pullState.pullStates) {
    expect(Math.abs(state.headerTopAfter - state.headerTopBefore)).toBeLessThan(1);
    expect(state.contentTransform).not.toBe("none");
    expect(state.indicatorTop).toBeGreaterThanOrEqual(10);
    expect(state.indicatorTop).toBeLessThanOrEqual(30);
  }
  expect(pullState.interruptedTransform).toBe("none");
});

test("keeps native auth pending until exchange succeeds and persists the session", async ({
  page,
}) => {
  await page.addInitScript(`${supabaseBrowserStub}
(() => {
  const originalCreateClient = window.supabase.createClient;
  const listeners = {};
  const storageKey = "glim-native-session-fixture";
  window.__nativeAppListeners = listeners;
  window.__nativeAuthOrder = [];
  window.supabase.createClient = (url, key, options) => {
    window.__supabaseClientOptions = options;
    const client = originalCreateClient(url, key, options);
    let nativeSession = JSON.parse(localStorage.getItem(storageKey) || "null");
    client.auth.getSession = async () => ({
      data: { session: nativeSession },
      error: null,
    });
    client.auth.signInWithOAuth = async () => ({
      data: { url: "https://accounts.example.test/oauth" },
      error: null,
    });
    client.auth.exchangeCodeForSession = async (authCode) => {
      window.__nativeAuthOrder.push("exchange-start");
      if (authCode === "bogus") {
        window.__nativeAuthOrder.push("exchange-error");
        return { data: { session: null }, error: new Error("invalid code") };
      }
      await new Promise((resolve) => setTimeout(resolve, 60));
      nativeSession = {
        user: {
          id: "native-auth-fixture",
          email: "native@example.test",
          user_metadata: { random_nickname: "네이티브 사용자" },
        },
      };
      localStorage.setItem(storageKey, JSON.stringify(nativeSession));
      window.__nativeAuthOrder.push("exchange-end");
      return { data: { session: nativeSession }, error: null };
    };
    return client;
  };
  window.Capacitor = {
    getPlatform: () => "android",
    isNativePlatform: () => true,
    Plugins: {
      App: {
        addListener: async (name, listener) => {
          listeners[name] = listener;
          return { remove: async () => {} };
        },
        getLaunchUrl: async () => undefined,
        exitApp: async () => {},
      },
      Browser: {
        open: async () => {
          window.__nativeAuthOrder.push("browser-open");
        },
        close: async () => {
          window.__nativeAuthOrder.push("browser-close");
        },
      },
    },
  };
})();`);
  await page.route("**/*", (route) => {
    if (!route.request().url().startsWith("http://127.0.0.1:4173/")) {
      route.abort();
      return;
    }
    route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__nativeAppListeners.appUrlOpen)))
    .toBe(true);

  await page.evaluate(async () => {
    window.__nativeAppListeners.appUrlOpen({
      url: "https://glimfactory.com/auth/callback?code=unsolicited",
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  expect(await page.evaluate(() => window.__nativeAuthOrder)).toEqual([]);

  await page.evaluate(async () => {
    localStorage.setItem("glim_ugc_policy_login_consent_seen", "1");
    await handleSocialLogin("google");
    window.__nativeAppListeners.appUrlOpen({
      url: "https://glimfactory.com/auth/callback?code=bogus",
    });
  });

  await expect
    .poll(() => page.evaluate(() => window.__nativeAuthOrder))
    .toEqual(["browser-open", "exchange-start", "exchange-error"]);
  expect(
    await page.evaluate(() => localStorage.getItem("glim_native_auth_pending")),
  ).not.toBeNull();

  await page.evaluate(() => {
    window.__nativeAppListeners.appUrlOpen({
      url: "https://glimfactory.com/auth/callback?code=authorized",
    });
  });

  await expect
    .poll(() => page.evaluate(() => window.__nativeAuthOrder))
    .toEqual([
      "browser-open",
      "exchange-start",
      "exchange-error",
      "exchange-start",
      "exchange-end",
      "browser-close",
    ]);
  expect(
    await page.evaluate(() => localStorage.getItem("glim_native_auth_pending")),
  ).toBeNull();
  await expect
    .poll(() => page.evaluate(() => currentUser?.id || ""))
    .toBe("native-auth-fixture");
  expect(
    await page.evaluate(() => window.__supabaseClientOptions?.auth),
  ).toMatchObject({
    persistSession: true,
    autoRefreshToken: true,
    flowType: "pkce",
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect
    .poll(() => page.evaluate(() => currentUser?.id || ""))
    .toBe("native-auth-fixture");
  expect(
    await page.locator("#profileContainer").evaluate((element) => element.style.display),
  ).toBe("block");
});

test("keeps settings titles below the Galaxy status area", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(supabaseBrowserStub);
  await page.route("**/*", (route) => {
    if (!route.request().url().startsWith("http://127.0.0.1:4173/")) {
      route.abort();
      return;
    }
    route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const layout = await page.evaluate(() => {
    document.documentElement.classList.add("native-android");
    activateAppView("view-settings");

    const topbar = document.querySelector("#view-settings .settings-page-topbar");
    const title = document.querySelector("#view-settings .settings-page-title");
    const rootStyle = getComputedStyle(document.documentElement);
    const topbarRect = topbar.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();

    return {
      isNativeAndroid: document.documentElement.classList.contains("native-android"),
      nativeSafeSpace: Number.parseFloat(
        rootStyle.getPropertyValue("--native-top-safe-space"),
      ),
      topbarHeight: topbarRect.height,
      titleTop: titleRect.top,
      titleBottom: titleRect.bottom,
    };
  });

  expect(layout.isNativeAndroid).toBe(true);
  expect(layout.nativeSafeSpace).toBe(32);
  expect(layout.topbarHeight).toBeGreaterThanOrEqual(96);
  expect(layout.titleTop).toBeGreaterThanOrEqual(layout.nativeSafeSpace + 8);
  expect(layout.titleBottom).toBeLessThanOrEqual(layout.topbarHeight - 8);
});
test("shows Explore results while typing before Enter", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(supabaseBrowserStub);
  await page.route("**/*", (route) => {
    if (!route.request().url().startsWith("http://127.0.0.1:4173/")) {
      route.abort();
      return;
    }
    route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.__supabaseRows.profiles = [{
      id: "live-search-user",
      nickname: "글리머",
      custom_id: "glimmer",
      avatar_url: "",
    }];
    window.__supabaseRows.posts = [{
      id: "live-search-post",
      content: "글림에서 문장을 찾는 중",
      author: "글리머",
      user_id: "live-search-user",
      likes_count: 3,
      created_at: "2026-07-19T00:00:00Z",
    }];
    activateAppView("view-explore");
    openExploreSearch();
  });

  await page.locator("#searchInput").focus();
  await page.locator("#searchInput").evaluate((input) => {
    input.value = "ㄱ";
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "ㄱ",
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );
  });
  await page.waitForTimeout(350);
  const composingSearchCalls = await page.evaluate(() =>
    window.__supabaseCalls.filter(({ name }) => name.endsWith(".ilike")),
  );
  expect(composingSearchCalls).toHaveLength(0);

  await page.locator("#searchInput").evaluate((input) => {
    input.value = "글리";
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "리",
        inputType: "insertCompositionText",
        isComposing: false,
      }),
    );
  });
  await expect(page.locator("#exploreSearchSummary")).toContainText(
    "‘글리’ 검색 결과",
    { timeout: 2_000 },
  );
  await expect(page.locator("#exploreUserResults")).toContainText("글리머");
  await expect(page.locator("#explorePostResults")).toContainText(
    "글림에서 문장을 찾는 중",
  );
});

test("pinch zooms the profile photo with two touch pointers", async ({ page }) => {
  await page.addInitScript(supabaseBrowserStub);
  await page.route("**/*", (route) => {
    if (!route.request().url().startsWith("http://127.0.0.1:4173/")) {
      route.abort();
      return;
    }
    route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const result = await page.evaluate(() => {
    const stage = document.getElementById("avatarCropStage");
    Object.defineProperties(stage, {
      setPointerCapture: { value: () => {}, configurable: true },
      hasPointerCapture: { value: () => false, configurable: true },
      releasePointerCapture: { value: () => {}, configurable: true },
    });
    const zoom = document.getElementById("avatarCropZoom");
    zoom.min = "0.3";
    zoom.max = "1.2";
    zoom.step = "0.003";
    zoom.value = "0.3";
    Object.assign(avatarCropState, {
      naturalWidth: 1000,
      naturalHeight: 1000,
      cropSize: 300,
      minScale: 0.3,
      maxScale: 1.2,
      scale: 0.3,
      x: 0,
      y: 0,
      isReady: true,
      isDragging: false,
      pointerId: null,
    });

    const emitPointer = (type, pointerId, clientX, clientY, isPrimary) => {
      stage.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        pointerId,
        pointerType: "touch",
        clientX,
        clientY,
        isPrimary,
      }));
    };

    emitPointer("pointerdown", 1, 120, 160, true);
    emitPointer("pointerdown", 2, 220, 160, false);
    emitPointer("pointermove", 2, 280, 160, false);
    const scaleAfterTwoPointers = avatarCropState.scale;
    emitPointer("pointerdown", 3, 200, 220, false);
    emitPointer("pointerup", 3, 200, 220, false);
    emitPointer("pointermove", 2, 320, 160, false);

    return {
      scale: avatarCropState.scale,
      scaleAfterTwoPointers,
      sliderValue: Number(document.getElementById("avatarCropZoom").value),
    };
  });

  expect(result.scale).toBeGreaterThan(0.3);
  expect(result.scale).toBeGreaterThan(result.scaleAfterTwoPointers);
  expect(result.sliderValue).toBeCloseTo(result.scale);
});

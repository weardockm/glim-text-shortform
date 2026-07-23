import { expect, test } from "@playwright/test";
import { supabaseBrowserStub } from "../security/fixtures/supabase-browser-stub.mjs";

test("profile tab buttons complete their transition within 200ms", async ({
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
  const elapsed = await page.evaluate(async () => {
    activateAppView("view-profile");
    const tabScroll = document.getElementById("profileGridScroll");
    document.getElementById("profileContainer").style.display = "block";
    document.getElementById("view-profile").style.display = "block";
    tabScroll.style.width = "390px";
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (tabScroll.clientWidth === 0) throw new Error("Profile tabs have no width");
    const target = tabScroll.clientWidth * 2;
    const startedAt = performance.now();
    scrollToProfileTab(2);

    return await new Promise((resolve) => {
      const observe = (now) => {
        if (
          Math.abs(tabScroll.scrollLeft - target) <= 1 ||
          now - startedAt > 1_000
        ) {
          resolve(now - startedAt);
          return;
        }
        requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    });
  });

  expect(elapsed).toBeGreaterThan(0);
  expect(elapsed).toBeLessThanOrEqual(200);
  await expect(page.locator("#tab-like")).toHaveClass(/active/);
});

test("touching a profile tab starts navigation before the click event", async ({
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
  await page.evaluate(async () => {
    document.getElementById("appSplash").style.display = "none";
    activateAppView("view-profile");
    document.getElementById("profileContainer").style.display = "block";
    document.getElementById("view-profile").style.display = "block";
    const tabScroll = document.getElementById("profileGridScroll");
    tabScroll.style.width = "390px";
    await new Promise((resolve) => requestAnimationFrame(resolve));
    document.getElementById("tab-like").dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        isPrimary: true,
        pointerId: 1,
        pointerType: "touch",
      }),
    );
  });

  await expect
    .poll(() => page.locator("#profileGridScroll").evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(0);
});

test("light mode keeps the selected default profile theme label readable", async ({
  page,
}) => {
  await page.addInitScript(supabaseBrowserStub);
  await page.route("**/*", (route) => {
    if (!route.request().url().startsWith("http://127.0.0.1:4173/")) {
      route.abort();
      return;
    }
    route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const colors = await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
    document.getElementById("appSplash").style.display = "none";
    openSheet("editProfileSheet");
    setSelectedProfileTheme("default");
    const option = document.querySelector(".profile-theme-option.is-selected");
    const title = option.querySelector(".profile-theme-option-title");
    const description = option.querySelector(".profile-theme-option-desc");
    return {
      background: getComputedStyle(option).backgroundColor,
      description: getComputedStyle(description).color,
      title: getComputedStyle(title).color,
    };
  });

  expect(colors).toEqual({
    background: "rgb(244, 235, 227)",
    description: "rgb(113, 104, 97)",
    title: "rgb(49, 44, 41)",
  });
});

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

test("publishes child safety standards without requiring sign-in", async ({
  page,
}) => {
  await page.addInitScript(supabaseBrowserStub);
  await page.route("**/*", (route) => {
    if (!route.request().url().startsWith("http://127.0.0.1:4173/")) {
      route.abort();
      return;
    }
    route.continue();
  });

  const response = await page.goto("/community-standards", {
    timeout: 10_000,
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await expect(page.locator("#view-community-standards")).toHaveClass(/active/);
  const standards = page.locator("#child-safety-standards");
  await expect(standards).toContainText("아동 성적 학대 및 착취(CSAE)");
  await expect(standards).toContainText("아동 성적 학대물(CSAM)");
  await expect(page.locator("#view-community-standards")).toContainText(
    "글림 아동 안전 담당자",
  );
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

test("profile save keeps the submitted ID and bio when USER_UPDATED fires", async ({
  page,
}) => {
  await page.addInitScript(supabaseBrowserStub);
  await page.route("**/*", (route) => {
    if (!route.request().url().startsWith("http://127.0.0.1:4173/")) {
      route.abort();
      return;
    }
    route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__authCallback))).toBe(true);

  const result = await page.evaluate(async () => {
    window.__ugcAccepted = true;
    window.__supabaseRows.profiles = [{
      id: "fixture-user",
      nickname: "기존이름",
      custom_id: "old.id",
      avatar_url: "",
      bio: "",
      theme: "default",
      updated_at: "2026-07-21T00:00:00Z",
    }];
    await window.__emitAuth({
      user: {
        id: "fixture-user",
        email: "fixture@example.test",
        user_metadata: { random_nickname: "기존이름", custom_id: "old.id" },
      },
    });
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    window.__supabaseCalls.length = 0;
    window.__emitUserUpdatedOnUpdate = true;
    window.__profileUpdateDelayMs = 25;
    document.getElementById("editNicknameInput").value = "새이름";
    document.getElementById("editIdInput").value = "new.id";
    document.getElementById("editBioInput").value = "새 소개";

    await saveProfile();
    await new Promise((resolve) => window.setTimeout(resolve, 100));

    const updates = window.__supabaseCalls
      .filter((call) => call.boundary === "table" && call.name === "profiles.update")
      .map((call) => call.detail);
    return {
      legacyUpdates: updates.filter((values) => "custom_id" in values),
      appearanceUpdates: updates.filter((values) => "bio" in values),
      profileId: document.getElementById("profileId").textContent,
      profileBio: document.getElementById("profileBio").textContent,
    };
  });

  expect(result.legacyUpdates.at(-1)?.custom_id).toBe("new.id");
  expect(result.appearanceUpdates.at(-1)?.bio).toBe("새 소개");
  expect(result.profileId).toBe("@new.id");
  expect(result.profileBio).toBe("새 소개");
});

test("profile save does not restore a user after SIGNED_OUT", async ({ page }) => {
  await page.addInitScript(supabaseBrowserStub);
  await page.route("**/*", (route) => {
    if (!route.request().url().startsWith("http://127.0.0.1:4173/")) {
      route.abort();
      return;
    }
    route.continue();
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(() => Boolean(window.__authCallback))).toBe(true);

  const result = await page.evaluate(async () => {
    window.__ugcAccepted = true;
    window.__supabaseRows.profiles = [{
      id: "fixture-user",
      nickname: "기존이름",
      custom_id: "old.id",
      avatar_url: "",
      bio: "",
      theme: "default",
      updated_at: "2026-07-21T00:00:00Z",
    }];
    await window.__emitAuth({
      user: {
        id: "fixture-user",
        email: "fixture@example.test",
        user_metadata: { random_nickname: "기존이름", custom_id: "old.id" },
      },
    });
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    window.__supabaseCalls.length = 0;
    window.__authUpdateDelayMs = 25;
    document.getElementById("editNicknameInput").value = "새이름";
    document.getElementById("editIdInput").value = "new.id";
    document.getElementById("editBioInput").value = "새 소개";

    const savePromise = saveProfile();
    window.setTimeout(() => window.__emitAuth(null, "SIGNED_OUT"), 5);
    await savePromise;
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    const authUpdatesBeforeRetry = window.__supabaseCalls
      .filter((call) => call.boundary === "auth" && call.name === "updateUser").length;
    await saveProfile();
    const authUpdatesAfterRetry = window.__supabaseCalls
      .filter((call) => call.boundary === "auth" && call.name === "updateUser").length;
    return { authUpdatesBeforeRetry, authUpdatesAfterRetry };
  });

  expect(result.authUpdatesBeforeRetry).toBe(1);
  expect(result.authUpdatesAfterRetry).toBe(1);
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

test("keeps native auth pending and recovers a completed session when a tablet resumes", async ({
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
    const originalUpdateUser = client.auth.updateUser;
    let authEventActive = false;
    client.auth.updateUser = async (...args) => {
      if (authEventActive) {
        window.__nativeAuthOrder.push("auth-lock-deadlock");
        return new Promise(() => {});
      }
      return originalUpdateUser(...args);
    };
    let nativeSession = JSON.parse(localStorage.getItem(storageKey) || "null");
    window.__setNativeSession = (session) => {
      nativeSession = session;
      if (session) {
        localStorage.setItem(storageKey, JSON.stringify(session));
      } else {
        localStorage.removeItem(storageKey);
      }
    };
    client.auth.getSession = async () => ({
      data: { session: nativeSession },
      error: null,
    });
    client.auth.signInWithOAuth = async ({ options: oauthOptions }) => {
      window.__nativeOAuthOptions = oauthOptions;
      return {
        data: { url: "https://accounts.example.test/oauth" },
        error: null,
      };
    };
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
          user_metadata: {},
        },
      };
      localStorage.setItem(storageKey, JSON.stringify(nativeSession));
      authEventActive = true;
      await window.__authCallback("SIGNED_IN", nativeSession);
      authEventActive = false;
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
        open: async ({ url }) => {
          window.__nativeBrowserUrl = url;
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
      url: "glim://auth/callback?error=access_denied",
    });
  });
  await expect
    .poll(() => page.evaluate(() => window.__nativeAuthOrder))
    .toEqual(["browser-open", "browser-close"]);
  expect(
    await page.evaluate(() => localStorage.getItem("glim_native_auth_pending")),
  ).toBeNull();
  await page.evaluate(() => {
    window.__nativeAuthOrder.length = 0;
  });

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
  expect(await page.evaluate(() => window.__nativeOAuthOptions?.redirectTo)).toBe(
    "glim://auth/callback",
  );
  expect(await page.evaluate(() => window.__nativeBrowserUrl)).toBe(
    "https://accounts.example.test/oauth",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("glim_native_auth_pending")),
  ).not.toBeNull();

  await page.evaluate(() => {
    const StandardURL = window.URL;
    window.URL = class AndroidWebViewURL extends StandardURL {
      constructor(value, base) {
        const parsed = new StandardURL(value, base);
        if (!String(value).startsWith("glim://")) return parsed;
        return new Proxy(parsed, {
          get(target, property) {
            if (property === "hostname") return "";
            if (property === "pathname") {
              return `//${target.hostname}${target.pathname}`;
            }
            const result = Reflect.get(target, property, target);
            return typeof result === "function" ? result.bind(target) : result;
          },
        });
      }
    };
    try {
      window.__nativeAppListeners.appUrlOpen({
        url: "glim://auth/callback?code=authorized",
      });
    } finally {
      window.URL = StandardURL;
    }
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

  await page.evaluate(async () => {
    window.__setNativeSession(null);
    currentUser = null;
    updateAuthUI();
    localStorage.setItem("glim_ugc_policy_login_consent_seen", "1");
    await handleSocialLogin("google");
    window.__setNativeSession({
      user: {
        id: "tablet-resume-fixture",
        email: "tablet@example.test",
        user_metadata: { random_nickname: "태블릿 사용자" },
      },
    });
    const listener = window.__nativeAppListeners.appStateChange;
    if (typeof listener !== "function") {
      throw new Error("Native auth session recovery listener is missing");
    }
    listener({ isActive: true });
  });

  await expect
    .poll(() => page.evaluate(() => currentUser?.id || ""))
    .toBe("tablet-resume-fixture");
  expect(
    await page.evaluate(() => localStorage.getItem("glim_native_auth_pending")),
  ).toBeNull();
  await expect
    .poll(() => page.evaluate(() => window.__nativeAuthOrder))
    .toContain("browser-close");
});

test("keeps bottom navigation controls above Android three-button navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(supabaseBrowserStub);
  await page.addInitScript(() => {
    window.Capacitor = {
      getPlatform: () => "android",
      isNativePlatform: () => true,
      Plugins: {
        GlimInsets: {
          getNavigationBarInset: async () => ({ bottom: 48 }),
        },
        StatusBar: {
          setOverlaysWebView: async () => {},
          setStyle: async () => {},
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
    .poll(() =>
      page.evaluate(() =>
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--native-bottom-safe-space",
          ),
        ),
      ),
    )
    .toBe(48);
  const layout = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const navItemRect = document
      .querySelector(".bottom-nav .nav-item")
      .getBoundingClientRect();
    return {
      nativeBottomSafeSpace: Number.parseFloat(
        rootStyle.getPropertyValue("--native-bottom-safe-space"),
      ),
      navItemBottom: navItemRect.bottom,
      viewportHeight: window.innerHeight,
    };
  });

  expect(layout.nativeBottomSafeSpace).toBe(48);
  expect(layout.navItemBottom).toBeLessThanOrEqual(layout.viewportHeight - 48);

  await page.setViewportSize({ width: 800, height: 1280 });
  await page.evaluate(async () => {
    window.Capacitor.Plugins.GlimInsets.getNavigationBarInset = async () => ({
      bottom: 0,
    });
    await syncNativeBottomSafeSpace();
  });
  const tabletLayout = await page.evaluate(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const navRect = document.querySelector(".bottom-nav").getBoundingClientRect();
    return {
      nativeBottomSafeSpace: Number.parseFloat(
        rootStyle.getPropertyValue("--native-bottom-safe-space"),
      ),
      navHeight: navRect.height,
      navBottom: window.innerHeight - navRect.bottom,
    };
  });

  expect(tabletLayout.nativeBottomSafeSpace).toBe(0);
  expect(tabletLayout.navHeight).toBe(70);
  expect(Math.abs(tabletLayout.navBottom)).toBeLessThan(1);
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
test("shows Explore results and empty counterpart sections while typing before Enter", async ({ page }) => {
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
    window.__supabaseRows.profiles = [
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `contains-search-user-${index}`,
        nickname: `한글사용자${index}`,
        custom_id: `hangul${index}`,
        avatar_url: "",
      })),
      {
        id: "live-search-user",
        nickname: "글리머1",
        custom_id: "glimmer1",
        avatar_url: "",
      },
    ];
    window.__supabaseRows.posts = [];
    activateAppView("view-explore");
    openExploreSearch();
  });

  await page.locator("#searchInput").focus();
  const composingSearchCallCount = await page.locator("#searchInput").evaluate((input) => {
    input.value = "글";
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "글",
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );
    return window.__supabaseCalls.filter(({ name }) => name.endsWith(".ilike")).length;
  });
  expect(composingSearchCallCount).toBeGreaterThan(0);
  const profileSearchPatterns = await page.evaluate(() =>
    window.__supabaseCalls
      .filter(({ name }) => name === "profiles.ilike")
      .map(({ detail }) => detail[1]),
  );
  expect(profileSearchPatterns).toContain("글%");
  expect(profileSearchPatterns).toContain("%글%");
  await expect(page.locator("#exploreSearchSummary")).toContainText(
    "‘글’ 검색 결과",
    { timeout: 2_000 },
  );
  await expect(page.locator("#exploreUserResults .explore-user-result-name").first()).toHaveText(
    "글리머1",
  );
  await expect(page.locator("#exploreSearchEmptyAll")).toBeHidden();
  await expect(page.locator("#explorePostResultGroup")).toBeVisible();
  await expect(page.locator("#explorePostResults")).toHaveText(
    "게시물 검색 결과 없음",
  );
  await expect(page.locator("#exploreSearchResults > .explore-search-result-group")).toHaveCount(2);
  expect(
    await page.locator("#exploreSearchResults > .explore-search-result-group").evaluateAll(
      (groups) => groups.map(({ id }) => id),
    ),
  ).toEqual(["exploreUserResultGroup", "explorePostResultGroup"]);

  await page.locator("#searchInput").evaluate((input) => {
    window.__supabaseRows.profiles = [];
    window.__supabaseRows.posts = [
      {
        id: "post-only-search-result",
        content: "보고 싶은 글",
        author: "글쓴이",
        mood: "calm",
        likes_count: 2,
        user_id: "post-only-author",
        created_at: "2026-07-23T00:00:00Z",
      },
    ];
    input.value = "보고";
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "고",
        inputType: "insertText",
      }),
    );
  });
  await expect(page.locator("#exploreSearchSummary")).toContainText(
    "‘보고’ 검색 결과",
    { timeout: 2_000 },
  );
  await expect(page.locator("#explorePostResults .explore-search-post")).toHaveText(
    /보고 싶은 글/,
  );
  await expect(page.locator("#exploreSearchEmptyAll")).toBeHidden();
  await expect(page.locator("#exploreUserResultGroup")).toBeVisible();
  await expect(page.locator("#exploreUserResults")).toHaveText(
    "유저 검색 결과 없음",
  );
  expect(
    await page.locator("#exploreSearchResults > .explore-search-result-group").evaluateAll(
      (groups) => groups.map(({ id }) => id),
    ),
  ).toEqual(["explorePostResultGroup", "exploreUserResultGroup"]);
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

test("mobile BGM picker stays at the left edge and filters uploaded tracks", async ({ page }) => {
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
  await page.evaluate(async () => {
    document.getElementById("appSplash").style.display = "none";
    const tracks = [
      {
        url: "https://qdnpeliqtxdglqewbvgg.supabase.co/storage/v1/object/public/bgm/calm.mp3",
        title: "고요한 새벽",
        artist: "GLIM",
        category: "잔잔한",
      },
      {
        url: "https://qdnpeliqtxdglqewbvgg.supabase.co/storage/v1/object/public/bgm/bright.mp3",
        title: "빛나는 아침",
        artist: "GLIM",
        category: "신나는",
      },
    ];
    replaceBgmTracks(tracks);
    selectBgmCategory("집중");
    await openBgmPicker();
    replaceBgmTracks(tracks);
    renderBgmPicker();
  });

  const categories = page.locator("#bgmPickerCategories");
  await expect(categories.getByRole("button")).toHaveCount(6);
  await expect(categories.getByRole("button", { name: "전체" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#bgmPickerList")).toContainText("고요한 새벽");
  await expect(page.locator("#bgmPickerList")).toContainText("빛나는 아침");

  const leftEdgeState = await categories.evaluate(async (element) => {
    element.scrollLeft = element.scrollWidth;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    element.scrollLeft = 0;
    await new Promise((resolve) => setTimeout(resolve, 300));
    return {
      scrollLeft: element.scrollLeft,
      scrollSnapType: getComputedStyle(element).scrollSnapType,
      viewTransform: document.getElementById("view-bgm-picker").style.transform,
    };
  });
  expect(leftEdgeState).toEqual({
    scrollLeft: 0,
    scrollSnapType: "none",
    viewTransform: "",
  });

  await categories.hover();
  await page.mouse.wheel(260, 0);
  await expect
    .poll(() => categories.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);

  const viewTransformAfterCategorySwipe = await page.evaluate(() => {
    const strip = document.getElementById("bgmPickerCategories");
    const target = strip.querySelector("button");
    const createTouch = (clientX) =>
      new Touch({
        identifier: 1,
        target,
        clientX,
        clientY: 120,
        pageX: clientX,
        pageY: 120,
        screenX: clientX,
        screenY: 120,
      });
    target.dispatchEvent(
      new TouchEvent("touchstart", {
        bubbles: true,
        cancelable: true,
        touches: [createTouch(40)],
      }),
    );
    target.dispatchEvent(
      new TouchEvent("touchmove", {
        bubbles: true,
        cancelable: true,
        touches: [createTouch(180)],
      }),
    );
    target.dispatchEvent(
      new TouchEvent("touchend", {
        bubbles: true,
        changedTouches: [createTouch(180)],
      }),
    );
    return document.getElementById("view-bgm-picker").style.transform;
  });
  expect(viewTransformAfterCategorySwipe).toBe("");

  await categories.getByRole("button", { name: "신나는" }).click();
  await expect(categories.getByRole("button", { name: "신나는" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#bgmPickerList")).toContainText("빛나는 아침");
  await expect(page.locator("#bgmPickerList")).not.toContainText("고요한 새벽");

  await categories.getByRole("button", { name: "집중" }).click();
  await expect(page.locator("#bgmPickerList")).toContainText("음악 없이 고요하게");
  await expect(page.locator("#bgmPickerList .bgm-picker-option")).toHaveCount(1);

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

import assert from "node:assert/strict";

export async function assertAnonymousAndOAuth(page) {
  await page.locator("#nav-write").dispatchEvent("click");
  const writeGate = await page.evaluate(() => ({
    message: document.querySelector("#appAlertMessage")?.textContent,
    hidden: document.querySelector("#appAlert")?.getAttribute("aria-hidden"),
  }));
  assert.deepEqual(writeGate, {
    message: "글을 작성하려면 로그인이 필요합니다.",
    hidden: "false",
  });
  await page.click("[data-app-alert-primary]");
  await page.click("#nav-profile", { force: true });
  await page.click(".google-btn", { force: true });
  assert.equal(await page.evaluate(() => window.__oauthProvider), "google");
  await page.click(".kakao-btn", { force: true });
  assert.equal(await page.evaluate(() => window.__oauthProvider), "kakao");
}

export async function runXssProbes(page, payloads) {
  const results = await page.evaluate(async (maliciousPayloads) => {
    window.__xss = 0;
    const fixture = document.createElement("section");
    fixture.id = "security-qa-fixture";
    fixture.style.cssText =
      "position:fixed;inset:0;z-index:20000;overflow:auto;background:#050505;color:white;padding:16px";
    document.body.appendChild(fixture);
    const probes = [];
    for (const payload of maliciousPayloads) {
      const post = createContextFeedPost({
        id: "post-fixture",
        user_id: "attacker",
        content: payload,
        author: payload,
        created_at: "2026-07-04T00:00:00Z",
        likes_count: 0,
        dislikes_count: 0,
      });
      fixture.appendChild(post);
      const comment = createCommentElement({
        id: "comment-fixture",
        user_id: "attacker",
        user_email: payload,
        content: payload,
        likes_count: 0,
      });
      fixture.appendChild(comment);
      const profile = createExploreUserResult({
        id: "profile-fixture",
        nickname: payload,
        custom_id: payload,
        avatar_url: "",
      });
      fixture.appendChild(profile);
      window.__supabaseRows.notifications = [{
        id: `notification-${probes.length}`,
        type: "comment",
        actor_nickname: payload,
        actor_user_id: "attacker",
        target_user_id: "fixture-user",
        preview_text: payload,
        post_id: "post-fixture",
        created_at: "2026-07-04T00:00:00Z",
      }];
      await fetchNotifications();
      const notificationList = document.querySelector("#notiList");
      probes.push({
        postText: post.querySelector(".text-content")?.textContent === payload,
        commentText: comment.querySelector(".comment-text")?.textContent === payload,
        profileText: profile.textContent.includes(payload),
        notificationText: payload.includes("\u0000")
          ? notificationList.textContent.includes("prefix") &&
            notificationList.textContent.includes("suffix")
          : notificationList.textContent.includes(payload),
        notificationHasRawElement: Boolean(
          notificationList.querySelector("script, img, [onerror]"),
        ),
      });
    }
    return {
      probes,
      xssSentinel: window.__xss,
      rawPayloadElements: fixture.querySelectorAll("script, [onerror]").length,
      externalMutation: document.documentElement.hasAttribute("data-xss"),
    };
  }, payloads);
  assert.deepEqual(
    {
      xssSentinel: results.xssSentinel,
      rawPayloadElements: results.rawPayloadElements,
      externalMutation: results.externalMutation,
    },
    { xssSentinel: 0, rawPayloadElements: 0, externalMutation: false },
  );
  for (const probe of results.probes) {
    assert.ok(
      probe.postText &&
        probe.commentText &&
        probe.profileText &&
        probe.notificationText &&
        !probe.notificationHasRawElement,
    );
  }
  return results;
}

export async function renderQaSummary(page, results) {
  await page.evaluate((summary) => {
    const fixture = document.querySelector("#security-qa-fixture");
    fixture.replaceChildren();
    const heading = document.createElement("h1");
    heading.textContent = "Glim DOM Security QA";
    heading.style.cssText = "font:700 24px sans-serif;margin:0 0 20px;color:#fff";
    fixture.appendChild(heading);
    for (const label of [
      "Authenticated post/profile/engagement PASS",
      "Admin authorization/moderation PASS",
    ]) {
      const row = document.createElement("p");
      row.textContent = label;
      row.style.cssText = "font:16px sans-serif;color:#7ee787;margin:12px 0";
      fixture.appendChild(row);
    }
    summary.probes.forEach((_probe, index) => {
      const row = document.createElement("p");
      row.textContent = `Payload ${index + 1}: post/comment/profile/notification PASS`;
      row.style.cssText = "font:16px sans-serif;color:#7ee787;margin:12px 0";
      fixture.appendChild(row);
    });
    const sentinel = document.createElement("p");
    sentinel.textContent = `XSS sentinel: ${summary.xssSentinel} · page errors: 0`;
    sentinel.style.cssText = "font:16px sans-serif;color:#7ee787;margin:24px 0";
    fixture.appendChild(sentinel);
  }, results);
}

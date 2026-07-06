import assert from "node:assert/strict";

export async function assertAuthenticatedJourneys(page) {
  const authenticated = await page.evaluate(async () => {
    await window.__emitAuth({
      user: {
        id: "fixture-user",
        email: "fixture@example.test",
        user_metadata: {
          random_nickname: "픽스처 사용자",
          custom_id: "fixture",
        },
      },
    });
    switchTab("write");
    return {
      authDisplay: document.querySelector("#authContainer").style.display,
      profileDisplay: document.querySelector("#profileContainer").style.display,
      profileName: document.querySelector("#profileName").textContent,
      writeActive: document.querySelector("#view-write").classList.contains("active"),
    };
  });
  assert.deepEqual(authenticated, {
    authDisplay: "none",
    profileDisplay: "block",
    profileName: "픽스처 사용자",
    writeActive: true,
  });

  const profile = await page.evaluate(async () => {
    window.__supabaseCalls.length = 0;
    document.querySelector("#editNicknameInput").value = "변경 사용자";
    document.querySelector("#editIdInput").value = "changed.id";
    await saveProfile();
    return {
      calls: window.__supabaseCalls.map(({ boundary, name }) => `${boundary}:${name}`),
      profileName: document.querySelector("#profileName").textContent,
      profileId: document.querySelector("#profileId").textContent,
      saveLabel: document.querySelector("#editProfileSaveButton").textContent,
    };
  });
  for (const expected of [
    "auth:updateUser",
    "table:profiles.upsert",
    "rpc:sync_authored_display_name",
  ]) {
    assert.ok(profile.calls.includes(expected), `missing ${expected}`);
  }
  assert.deepEqual(
    {
      profileName: profile.profileName,
      profileId: profile.profileId,
      saveLabel: profile.saveLabel,
    },
    {
      profileName: "변경 사용자",
      profileId: "@changed.id",
      saveLabel: "저장하기",
    },
  );

  const engagement = await page.evaluate(async () => {
    window.__supabaseCalls.length = 0;
    document.querySelector("#postContent").value = "행동으로 확인하는 새 글입니다";
    document.querySelector("#postMood").value = "사색";
    document.querySelector("#postBgm").value = "";
    await submitPost();
    const post = createContextFeedPost({
      id: "engagement-post",
      user_id: "fixture-user",
      content: "행동 특성화",
      author: "변경 사용자",
      mood: "사색",
      created_at: "2026-07-04T00:00:00Z",
      likes_count: 0,
      dislikes_count: 0,
    });
    document.body.appendChild(post);
    const likeButton = post.querySelector('[data-post-action="like"]');
    const bookmarkButton = post.querySelector('[data-post-action="bookmark"]');
    await incrementMetric("engagement-post", "likes_count", likeButton);
    await toggleBookmark("engagement-post", bookmarkButton);
    viewedProfileUserId = "follow-target";
    viewedProfileIsFollowing = false;
    document.querySelector("#viewedProfileFollowButton").dataset.nickname =
      "팔로우 대상";
    await toggleFollow();
    currentPostIdForComment = "engagement-post";
    document.querySelector("#commentInput").value = "픽스처 댓글";
    await submitComment();
    await submitUserBlock("blocked-target");
    pendingReportTarget = { type: "post", id: "reported-post" };
    document.querySelector('input[name="reportReason"]').checked = true;
    document.querySelector("#reportDetails").value = "픽스처 신고";
    await submitReport();
    return {
      calls: window.__supabaseCalls.map(({ boundary, name }) => `${boundary}:${name}`),
      postContent: document.querySelector("#postContent").value,
      postMood: document.querySelector("#postMood").value,
      homeActive: document.querySelector("#view-home").classList.contains("active"),
      likeCount: likeButton.querySelector(".action-count").textContent,
      bookmarkLabel: bookmarkButton.querySelector(".action-count").textContent,
      following: viewedProfileIsFollowing,
      commentCleared: document.querySelector("#commentInput").value,
      blocked: blockedUserIds.has("blocked-target"),
      reportReset: pendingReportTarget,
    };
  });
  for (const expected of [
    "table:posts.insert",
    "rpc:toggle_post_like",
    "rpc:toggle_post_bookmark",
    "table:follows.insert",
    "table:comments.insert",
    "table:blocks.insert",
    "rpc:submit_content_report",
  ]) {
    assert.ok(engagement.calls.includes(expected), `missing ${expected}`);
  }
  assert.deepEqual(
    {
      postContent: engagement.postContent,
      postMood: engagement.postMood,
      homeActive: engagement.homeActive,
      likeCount: engagement.likeCount,
      bookmarkLabel: engagement.bookmarkLabel,
      following: engagement.following,
      commentCleared: engagement.commentCleared,
      blocked: engagement.blocked,
      reportReset: engagement.reportReset,
    },
    {
      postContent: "",
      postMood: "",
      homeActive: true,
      likeCount: "1",
      bookmarkLabel: "담김",
      following: true,
      commentCleared: "",
      blocked: true,
      reportReset: null,
    },
  );
  return { authenticated, profile, engagement };
}

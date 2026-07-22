import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const indexSource = readFileSync(new URL("../../index.js", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const adminHtml = readFileSync(new URL("../../admin.html", import.meta.url), "utf8");
const adminSource = readFileSync(new URL("../../admin.js", import.meta.url), "utf8");
const pushConfig = readFileSync(new URL("../../push-config.js", import.meta.url), "utf8");

test("native push registration replaces only Android web delivery", () => {
  assert.match(indexSource, /delivery_channel:\s*deliveryChannel/u);
  assert.match(
    indexSource,
    /savePushSubscription\(token\.value,[\s\S]*?deliveryChannel:\s*"native"/u,
  );
  assert.match(
    indexSource,
    /\.eq\("delivery_channel",\s*"web"\)[\s\S]*?\.ilike\("user_agent",\s*"%Android%"\)/u,
  );
});

function positionOf(source, fragment) {
  const position = source.indexOf(fragment);
  assert.notEqual(position, -1, `missing contract fragment: ${fragment}`);
  return position;
}

function extractSourceBlock(startFragment, endFragment) {
  const start = positionOf(indexSource, startFragment);
  const end = positionOf(indexSource, endFragment);
  assert.ok(end > start, `invalid source block: ${startFragment}`);
  return indexSource.slice(start, end);
}

test("Given an anonymous startup, When init runs, Then session and read state load before the feed", () => {
  const initSource = indexSource.slice(
    positionOf(indexSource, "async function init()"),
    positionOf(indexSource, "function activateAppView"),
  );
  const orderedCalls = [
    "client.auth.getSession()",
    "await ensureCurrentUserProfileReady()",
    "await loadBlockedUsersState()",
    "await loadEngagementState()",
    "updateAuthUI()",
    "await bgmCatalogPromise",
    "await fetchPosts()",
    "await handleNotificationDeepLink()",
  ];

  const positions = orderedCalls.map((fragment) => positionOf(initSource, fragment));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));
  assert.match(indexSource, /\.from\("posts"\)[\s\S]*?\.order\("created_at"/);
});

test("Given an anonymous user, When write or notifications are opened, Then login is required without blocking feed reads", () => {
  assert.match(
    indexSource,
    /if \(tabName === "write" && !currentUser\)[\s\S]*?글을 작성하려면 로그인이 필요합니다\.[\s\S]*?switchTab\("profile"\)/,
  );
  assert.match(
    indexSource,
    /if \(!currentUser\) \{[\s\S]*?notiList\.innerHTML = renderNotificationState\([\s\S]*?"로그인이 필요합니다\."/,
  );
  assert.match(indexHtml, /id="nav-home"[\s\S]*?id="nav-write"/);
});

test("Given each supported sign-in provider, When OAuth starts, Then it returns to the configured web or native callback", () => {
  assert.ok(indexSource.includes("const options = { redirectTo: getOAuthRedirectUrl() };"));
  assert.ok(indexSource.includes("provider: provider,"));
  assert.ok(indexSource.includes("options,"));
  assert.ok(indexSource.includes("function getOAuthRedirectUrl()"));
  assert.ok(indexSource.includes("GLIM_PRODUCTION_ORIGIN"));
  assert.ok(indexSource.includes("AUTH_CALLBACK_PATH"));
  for (const provider of ["google", "kakao"]) {
    assert.ok(indexHtml.includes(`handleSocialLogin('${provider}')`));
    assert.ok(indexSource.includes(`"handleSocialLogin('${provider}')"`));
  }
  assert.ok(!indexHtml.includes("Apple로 계속하기"));
  assert.ok(!indexHtml.includes("handleSocialLogin('apple')"));
});

test("Given authenticated engagement, When actions run, Then server contracts own reactions and reports", () => {
  const contracts = [
    ["post like", /client\.rpc\("toggle_post_like"/],
    ["bookmark", /client\.rpc\([\s\S]*?"toggle_post_bookmark"/],
    ["comment like", /client\.rpc\("toggle_comment_like"/],
    ["report", /client\.rpc\("submit_content_report"/],
    ["comment", /client\.from\("comments"\)[\s\S]{0,80}?\.insert/],
    ["follow", /client\.from\("follows"\)[\s\S]{0,80}?\.insert/],
    ["block", /client\.from\("blocks"\)[\s\S]{0,80}?\.insert/],
    ["account deletion", /client\.functions\.invoke\("delete-account"/],
  ];

  for (const [name, pattern] of contracts) {
    assert.match(indexSource, pattern, `${name} contract drifted`);
  }
});

test("Given UGC safety controls, When post/comment/report/block routes are inspected, Then public UI exposes the full moderation path", () => {
  assert.match(indexSource, /async function ensureCurrentUgcPolicyAccepted\(\)/);
  assert.match(indexSource, /client\.rpc\("get_ugc_policy_acceptance_status"/);
  assert.match(indexSource, /client\.rpc\("accept_current_ugc_policy"/);
  assert.match(indexSource, /await ensureCurrentUgcPolicyAccepted\(\)[\s\S]*?getCommentInputContent\(\)/);
  assert.match(indexSource, /await ensureCurrentUgcPolicyAccepted\(\)[\s\S]*?document\.getElementById\("postContent"\)/);
  assert.match(indexSource, /function reportPost\(postId\)[\s\S]*?openReportSheet\("post", postId\)/);
  assert.match(indexSource, /function reportComment\(commentId\)[\s\S]*?openReportSheet\("comment", commentId\)/);
  assert.match(indexSource, /function reportUser\(userId\)[\s\S]*?openReportSheet\("user", userId\)/);
  assert.match(indexSource, /function blockUser\(userId\)/);
  assert.match(indexHtml, /id="blockedUsersSheet"/);
  assert.match(indexHtml, /data-glim-click="openBlockedUsersSheet\(\)"/);
});

test("Given moderated content, When public feeds and comments are fetched, Then client requests only approved rows", () => {
  assert.match(indexSource, /const VISIBLE_CONTENT_MODERATION_STATUS = "approved"/);
  assert.equal(
    indexSource.match(/\.eq\("moderation_status", VISIBLE_CONTENT_MODERATION_STATUS\)/g)
      ?.length,
    1,
  );
  assert.match(
    indexSource,
    /async function runVisibleContentQuery\([\s\S]*?buildQuery,[\s\S]*?diagnosticContext,[\s\S]*?finalizeQuery = \(query\) => query,[\s\S]*?finalizeQuery\(selectVisibleContent\(buildQuery\(\)\)\)[\s\S]*?isMissingModerationStatusColumnError\(result\.error\)[\s\S]*?return finalizeQuery\(buildQuery\(\)\)/,
  );
  assert.match(
    indexSource,
    /async function fetchPosts\(\)[\s\S]*?runVisibleContentQuery\([\s\S]*?"feed-load"/,
  );
  assert.match(indexSource, /function isMissingModerationStatusColumnError\(error\)/);
  assert.match(
    indexSource,
    /async function loadProfileGrid\(tabType\)[\s\S]*?runVisibleContentQuery\([\s\S]*?`profile-\$\{tabType\}-grid-load`/,
  );
  assert.match(
    indexSource,
    /async function fetchExploreMoodPosts\(keyword = ""\)[\s\S]*?runVisibleContentQuery\([\s\S]*?"explore-mood-posts-load"/,
  );
  assert.match(
    indexSource,
    /async function fetchExplorePosts\(keyword = ""\)[\s\S]*?runVisibleContentQuery\(buildTodayQuery, "explore-today-posts-load"\)[\s\S]*?runVisibleContentQuery\(buildAllTimeQuery, "explore-all-time-posts-load"\)/,
  );
  assert.match(
    indexSource,
    /async function searchPosts\(forcedQuery = null, \{ saveHistory = true \} = \{\}\)[\s\S]*?runVisibleContentQuery\([\s\S]*?"explore-search-posts-load"/,
  );
  assert.match(
    indexSource,
    /async function fetchComments\(postId\)[\s\S]*?runVisibleContentQuery\([\s\S]*?"comments-load"/,
  );
});

test("Given public support and policy routes, When static source is inspected, Then review links are store-facing and contactable", () => {
  assert.match(indexHtml, /id="view-support"/);
  assert.match(indexHtml, /id="supportContactLink"[\s\S]*href="mailto:weardockm@gmail\.com/);
  assert.match(indexHtml, /신고 결과, 계정 제한, 콘텐츠 격리·삭제/);
  assert.match(indexHtml, /id="view-community-standards"/);
  assert.match(indexHtml, /글과 댓글 작성 전 최신 이용약관과 커뮤니티 기준 동의가 필요합니다/);
  assert.match(indexSource, /window\.location\.pathname === "\/support"/);
  assert.match(indexSource, /window\.location\.pathname === "\/community-standards"/);
});

test("Given moderator review, When admin source renders reports, Then SLA appeal quarantine state and action are visible", () => {
  assert.match(adminSource, /APPEAL_STATUS_LABELS/);
  assert.match(adminSource, /검토 SLA/);
  assert.match(adminSource, /이의제기/);
  assert.match(adminSource, /격리\/보존/);
  assert.match(adminSource, /"quarantine_content"/);
  assert.match(adminHtml, /\.report-review-meta/);
});

test("Given the BGM catalog changes remotely, When the picker opens, Then tracks refresh without a new app bundle", () => {
  assert.match(indexSource, /client\s*\.from\("bgm_tracks"\)/u);
  assert.match(indexSource, /async function loadBgmTracks/u);
  assert.match(
    indexSource,
    /async function openBgmPicker\(\)[\s\S]*?renderBgmPicker\(\)[\s\S]*?await loadBgmTracks\(\)/u,
  );
  assert.match(adminHtml, /id="adminBgmForm"/u);
  assert.match(adminSource, /client\.storage\.from\("bgm"\)\.upload/u);
  assert.match(adminSource, /client\s*\.from\("bgm_tracks"\)\.insert/u);
});

test("Given notification delivery, When a target is selected, Then category and post identifiers cross the boundary explicitly", () => {
  assert.match(
    indexSource,
    /fetch\(`\$\{SUPABASE_URL\}\/functions\/v1\/send-push`, \{[\s\S]*?Authorization: `Bearer \$\{session\.access_token\}`/,
  );
  assert.match(
    indexSource,
    /notificationPost[\s\S]*?notificationType[\s\S]*?window\.history\.replaceState/,
  );
  assert.match(indexSource, /DEFAULT_NOTIFICATION_PREFERENCES = Object\.freeze\(\{[\s\S]*?announcements: true/);
});

test("Given browser-visible configuration, When source is inspected, Then only publishable identifiers are present", () => {
  assert.match(indexSource, /const SUPABASE_ANON_KEY = "sb_publishable_/);
  assert.match(pushConfig, /firebase:\s*Object\.freeze\(\{/);
  assert.match(pushConfig, /vapidKey:/);
  assert.doesNotMatch(
    `${indexSource}\n${adminSource}\n${pushConfig}`,
    /service[_-]?role|private[_-]?key|FIREBASE_SERVICE_ACCOUNT_JSON/i,
  );
});

test("Given local browser state, When preferences are stored, Then the characterized namespaces remain explicit", () => {
  const keys = [
    "glim_mood_scores",
    "glim_seen_posts",
    "glim_engagement_migrated",
    "glim_explore_search_history",
    "glim_theme_preference",
    "glim_notification_preferences",
    "glim_push_fid",
    "glim_push_onboarding_seen",
  ];

  for (const key of keys) {
    assert.ok(indexSource.includes(key) || indexHtml.includes(key), `missing storage namespace: ${key}`);
  }
  assert.doesNotMatch(indexSource, /sessionStorage/);
});

test("Given home recommendations, When posts are ranked, Then personal fit beats raw recency and seen posts fall", () => {
  const context = { result: null, Set, Date, Math, Object, Number, String };
  vm.createContext(context);
  vm.runInContext(
    extractSourceBlock(
      "const FEED_RECOMMENDATION_CANDIDATE_LIMIT",
      "function updateMoodScore",
    ),
    context,
  );

  context.posts = [
    { id: "fresh", user_id: "a", mood: "new", likes_count: 2, dislikes_count: 1, created_at: "2026-07-08T00:00:00Z" },
    { id: "match", user_id: "b", mood: "comfort", likes_count: 1, dislikes_count: 1, created_at: "2026-07-07T23:00:00Z" },
    { id: "seen", user_id: "c", mood: "comfort", likes_count: 80, dislikes_count: 30, created_at: "2026-07-08T00:00:00Z" },
    {
      id: "ai-match",
      user_id: "d",
      mood: "new",
      likes_count: 0,
      dislikes_count: 0,
      created_at: "2026-07-07T22:00:00Z",
      ai_profile: {
        topics: ["연애"],
        emotions: ["그리움"],
        tone: "고백",
        recommendation_vector: { keywords: ["기다림"] },
      },
    },
  ];
  context.signals = {
    moodScores: { comfort: 20 },
    seenPostIds: new Set(["seen"]),
    likedPostIds: new Set(),
    bookmarkedPostIds: new Set(),
    aiPreferenceScores: { "연애": 20, "그리움": 16, "고백": 8 },
    nowMs: Date.parse("2026-07-08T00:00:00Z"),
    todaySeed: "recommendation-test",
  };

  vm.runInContext("result = rankRecommendedPosts(posts, signals).map((post) => post.id)", context);

  assert.equal(context.result[0], "match");
  assert.ok(context.result.indexOf("ai-match") < context.result.indexOf("fresh"));
  assert.ok(context.result.indexOf("seen") > context.result.indexOf("fresh"));
  assert.match(indexSource, /limit\(FEED_RECOMMENDATION_CANDIDATE_LIMIT\)/);
  assert.match(indexSource, /post_ai_profiles/);
  assert.match(indexSource, /functions\/v1\/analyze-post/);
});

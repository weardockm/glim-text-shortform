const SUPABASE_URL = "https://qdnpeliqtxdglqewbvgg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mwYlhge63nnNjL9lAFhxRw_fxRtRGvO";
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    flowType: "pkce",
  },
});
const nativeConfirm = window.confirm.bind(window);
const SUPABASE_STORAGE_ORIGIN = new URL(SUPABASE_URL).origin;
const GLIM_PRODUCTION_ORIGIN = "https://glimfactory.com";
const AUTH_CALLBACK_PATH = "/auth/callback";
const NATIVE_AUTH_PENDING_KEY = "glim_native_auth_pending";
const NATIVE_AUTH_PENDING_MAX_AGE_MS = 10 * 60 * 1000;
const VISIBLE_CONTENT_MODERATION_STATUS = "approved";

function selectVisibleContent(query) {
  return query.eq("moderation_status", VISIBLE_CONTENT_MODERATION_STATUS);
}

function isMissingModerationStatusColumnError(error) {
  return (
    error?.code === "42703" &&
    String(error.message || "").includes("moderation_status")
  );
}

function isMissingPostBgmTitleColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    ["42703", "PGRST204"].includes(error?.code) &&
    message.includes("bgm_title")
  );
}

function isMissingProfileAppearanceColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    ["42703", "PGRST204"].includes(error?.code) &&
    (message.includes("bio") || message.includes("theme"))
  );
}

async function runVisibleContentQuery(
  buildQuery,
  diagnosticContext,
  finalizeQuery = (query) => query,
) {
  const result = await finalizeQuery(selectVisibleContent(buildQuery()));
  if (!isMissingModerationStatusColumnError(result.error)) return result;

  reportClientDiagnostic(
    `${diagnosticContext}-moderation-status-missing`,
    result.error,
  );
  return finalizeQuery(buildQuery());
}

function reportClientDiagnostic(context, detail = null) {
  const diagnostic = { context };
  if (detail && typeof detail === "object") {
    if (typeof detail.name === "string") diagnostic.name = detail.name;
    if (typeof detail.code === "string") diagnostic.code = detail.code;
    if (Number.isInteger(detail.status)) diagnostic.status = detail.status;
  }
  console.warn("[glim]", diagnostic);
}

function createProfilePersistenceError(error) {
  const persistenceError = new Error("Profile persistence failed");
  persistenceError.name = "ProfilePersistenceError";
  persistenceError.cause = error || null;
  if (typeof error?.code === "string") persistenceError.code = error.code;
  return persistenceError;
}

function isProfilePersistenceError(error) {
  return error?.name === "ProfilePersistenceError";
}

function getTrustedMediaUrl(value) {
  try {
    const candidate = new URL(String(value || ""), window.location.href);
    const isSameOrigin = candidate.origin === window.location.origin;
    const isSupabaseBgm =
      candidate.origin === SUPABASE_STORAGE_ORIGIN &&
      candidate.pathname.startsWith("/storage/v1/object/public/bgm/");
    if (!["http:", "https:"].includes(candidate.protocol)) return "";
    return isSameOrigin || isSupabaseBgm ? candidate.href : "";
  } catch (_error) {
    return "";
  }
}

let currentPlayingBtn = null; // 현재 재생중인 버튼 기억
let isBgmEnabled = true;
let currentBgmUrl = "";
let bgmSyncFrame = null;
let isWaitingForBgmGesture = false;
let previewingBgmUrl = "";
let currentUser = null;
let currentUserIsModerator = false;
const blockedUserIds = new Set();
const blockedUserNicknames = new Set();
const likedPostIds = new Set();
const bookmarkedPostIds = new Set();
const likedCommentIds = new Set();
const ENGAGEMENT_MIGRATION_STORAGE_PREFIX = "glim_engagement_migrated";
let currentPostIdForComment = null;
let currentCommentPostElement = null;
let pendingCommentReplyTarget = null;
let currentCommentSourceViewElement = null;
let currentCommentSourcePlaceholderElement = null;
let currentCommentSourceScrollTop = 0;
let pendingCommentSourceAnimationFrame = 0;
let pendingCommentSourceScrollTimers = [];
let isCommentSheetDragging = false;
const COMMENT_SHEET_REST_HEIGHT_DVH = 50;
const COMMENT_SHEET_FOCUSED_HEIGHT_DVH = 56;
const COMMENT_SHEET_DRAG_RANGE_PX = 180;
const COMMENT_SHEET_DRAG_SETTLE_PX = 54;
const COMMENT_SHEET_DRAG_TRANSLATE_RATIO = 0.32;
const COMMENT_SOURCE_FOCUSED_SCALE_DELTA = 0.035;
const COMMENT_SOURCE_SHEET_LIFT_RATIO = 0.24;
const COMMENT_SOURCE_SCROLL_PIN_DELAYS_MS = [40, 120, 240, 420, 620, 820];
let pendingReportTarget = null;
let viewedProfileUserId = null;
let viewedProfileIsFollowing = false;
let userProfileReturnViewId = "view-home";
let contextFeedReturnViewId = "view-home";
let noticeReturnViewId = "view-settings";
let legalReturnViewId = "view-settings";
let isRefreshing = false;
let lastNavTapTab = null;
let lastNavTapTime = 0;
let pullIndicatorHideTimer = null;
const refreshPullInterruptors = new Set();
let exploreFetchRequestId = 0;
let exploreMoodFetchRequestId = 0;
let exploreSearchRequestId = 0;
let exploreSearchInputTimer = null;
const EXPLORE_SEARCH_INPUT_DELAY_MS = 220;
let isExploreSearchOpen = false;
let selectedExploreMood = "사색";
let postTextMeasureElement = null;
let isPostContentInputHandlerReady = false;
let selectedProfileAvatarFile = null;
let shouldRemoveProfileAvatar = false;
let editAvatarPreviewObjectUrl = null;
let avatarCropSourceUrl = null;
let avatarCropOriginalFile = null;
let currentProfileNickname = "";
let currentProfileCustomId = "";
let currentProfileBio = "";
let currentProfileTheme = "default";
let selectedProfileTheme = "default";
const AVATAR_CROP_OUTPUT_SIZE = 512;
const MAX_AVATAR_SOURCE_SIZE = 15 * 1024 * 1024;
const DEFAULT_PROFILE_AVATAR_URL = "image/glimmer-profile-image.png";
const PROFILE_AVATAR_STORAGE_PATH = "/storage/v1/object/public/avatars/";
const PROFILE_BIO_MAX_LENGTH = 60;
const PROFILE_THEMES = Object.freeze({
  default: {
    label: "기본",
    viewClass: "profile-theme-default",
  },
});
const PROFILE_THEME_VIEW_CLASSES = Object.freeze([
  "profile-theme-default",
  "profile-theme-lofi-night",
  "profile-theme-vintage-analog",
]);
const POST_MIN_CHARACTERS = 5;
const POST_MAX_CHARACTERS = 120;
const POST_MAX_VISUAL_LINES = 12;
const POST_CENTERED_VISUAL_LINES = 8;
const POST_REFERENCE_LINE_HEIGHT = 17 * 1.65;
const REPORT_REASON_LABELS = Object.freeze({
  spam: "스팸 또는 광고",
  harassment: "괴롭힘 또는 모욕",
  hate: "혐오 표현",
  sexual: "성적인 콘텐츠",
  violence: "폭력적이거나 위험한 내용",
  personal_info: "개인정보 노출",
  other: "기타",
});
const EXPLORE_SEARCH_HISTORY_KEY = "glim_explore_search_history";
const EXPLORE_SEARCH_HISTORY_LIMIT = 8;
const THEME_PREFERENCE_KEY = "glim_theme_preference";
const NOTIFICATION_PREFERENCES_STORAGE_PREFIX =
  "glim_notification_preferences";
const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  likes: true,
  comments: true,
  follows: true,
  announcements: true,
});
const NOTIFICATION_PREFERENCE_KEYS = new Set(
  Object.keys(DEFAULT_NOTIFICATION_PREFERENCES),
);
const PENDING_UGC_POLICY_ACCEPTANCE_STORAGE_KEY =
  "glim_pending_ugc_policy_acceptance";
const UGC_POLICY_LOGIN_CONSENT_SEEN_STORAGE_KEY =
  "glim_ugc_policy_login_consent_seen";
let promptedUgcPolicyUserId = null;
const FIREBASE_WEB_SDK_VERSION = "12.15.0";
const PUSH_FID_STORAGE_PREFIX = "glim_push_fid";
const PUSH_ONBOARDING_STORAGE_PREFIX = "glim_push_onboarding_seen";
const APP_SPLASH_MIN_VISIBLE_MS = 950;
const appSplashStartedAt = Date.now();
let firebasePushModulesPromise = null;
let pushMessaging = null;
let pushServiceWorkerRegistration = null;
let pushEventListenersReady = false;
let pendingPushRegistration = null;
let pushRemoteStatusCheckId = 0;
let pushOnboardingTimer = null;
let appSplashHideTimer = null;
let appSplashFinished = false;
const systemThemeMediaQuery = window.matchMedia(
  "(prefers-color-scheme: dark)",
);
const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const avatarCropState = {
  naturalWidth: 0,
  naturalHeight: 0,
  stageSize: 0,
  cropSize: 0,
  minScale: 1,
  maxScale: 4,
  scale: 1,
  x: 0,
  y: 0,
  isDragging: false,
  pointerId: null,
  startClientX: 0,
  startClientY: 0,
  startX: 0,
  startY: 0,
  pinchStartDistance: 0,
  pinchStartScale: 1,
  pinchStartCenterX: 0,
  pinchStartCenterY: 0,
  pinchStartX: 0,
  pinchStartY: 0,
  isReady: false,
};
const avatarCropPointers = new Map();
const contextPostCollections = new Map();
const contextPostTitles = new Map();
const postViewTimers = new Map();

const FEED_RECOMMENDATION_CANDIDATE_LIMIT = 160;
const AI_RECOMMENDATION_SCORES_KEY = "glim_ai_recommendation_scores";
const AI_PROFILE_TABLE_MISSING_CODES = new Set(["42P01", "PGRST204", "PGRST205"]);
const postAiAnalysisRequestIds = new Set();
const RECOMMENDATION_AUTHOR_DIVERSITY_WINDOW = 2;
const RECOMMENDATION_AUTHOR_SEARCH_WINDOW = 8;
const RECOMMENDATION_AUTHOR_SWAP_SCORE_GAP = 18;

function readStoredJson(key, fallbackValue) {
  if (typeof localStorage === "undefined") return fallbackValue;
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) ?? fallbackValue : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function clampRecommendationValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getPostMetric(post, key) {
  const value = Number(post?.[key] ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getPostAgeDays(post, nowMs = Date.now()) {
  const createdAtMs = new Date(post?.created_at || 0).getTime();
  if (!Number.isFinite(createdAtMs)) return 30;
  return Math.max(0, (nowMs - createdAtMs) / 86400000);
}

function getDailyRecommendationJitter(post, seed = new Date().toISOString().slice(0, 10)) {
  const source = String(post?.id || post?.created_at || "post") + ":" + seed;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return (hash % 1000) / 1000;
}

function getNormalizedMoodPreference(moodScores, mood) {
  if (!mood || !moodScores || typeof moodScores !== "object") return 0;
  const scores = Object.values(moodScores)
    .map((value) => Number(value) || 0)
    .filter((value) => value > 0);
  if (scores.length === 0) return 0;
  return clampRecommendationValue((Number(moodScores[mood]) || 0) / Math.max(...scores, 1), 0, 1);
}

function getPostAuthorKey(post) {
  return String(post?.user_id || post?.author || "");
}

function normalizeAiRecommendationTerm(value) {
  return String(value || "").trim().toLowerCase();
}

function getPostAiProfile(post) {
  return post?.ai_profile || post?.aiProfile || null;
}

function getAiTermsFromProfile(profile) {
  if (!profile || typeof profile !== "object") return [];
  const vector = profile.recommendation_vector && typeof profile.recommendation_vector === "object"
    ? profile.recommendation_vector
    : {};
  const rawTerms = [
    ...(Array.isArray(profile.topics) ? profile.topics : []),
    ...(Array.isArray(profile.emotions) ? profile.emotions : []),
    ...(Array.isArray(vector.topics) ? vector.topics : []),
    ...(Array.isArray(vector.emotions) ? vector.emotions : []),
    ...(Array.isArray(vector.keywords) ? vector.keywords : []),
    profile.tone,
    vector.tone,
    vector.selected_mood,
  ];
  return [...new Set(rawTerms.map(normalizeAiRecommendationTerm).filter(Boolean))].slice(0, 18);
}

function getPostAiTerms(post) {
  return getAiTermsFromProfile(getPostAiProfile(post));
}

function getAiRecommendationPreferenceScore(terms, aiPreferenceScores = {}) {
  if (!terms.length || !aiPreferenceScores || typeof aiPreferenceScores !== "object") return 0;
  const values = Object.values(aiPreferenceScores)
    .map((value) => Number(value) || 0)
    .filter((value) => value > 0);
  if (values.length === 0) return 0;
  const maxScore = Math.max(...values, 1);
  const total = terms.reduce((sum, term) => sum + (Number(aiPreferenceScores[term]) || 0), 0);
  return clampRecommendationValue(total / (maxScore * Math.min(terms.length, 4)), 0, 1);
}

function updateAiPreferenceScores(terms, points) {
  if (!Array.isArray(terms) || terms.length === 0 || !points) return;
  const scores = readStoredJson(AI_RECOMMENDATION_SCORES_KEY, {});
  terms.slice(0, 12).forEach((term) => {
    const key = normalizeAiRecommendationTerm(term);
    if (key) scores[key] = (Number(scores[key]) || 0) + points;
  });
  localStorage.setItem(AI_RECOMMENDATION_SCORES_KEY, JSON.stringify(scores));
}

function updateAiPreferenceScoresFromElement(element, points) {
  if (!element?.dataset?.aiTerms) return;
  try {
    updateAiPreferenceScores(JSON.parse(element.dataset.aiTerms), points);
  } catch {
    // Ignore malformed local DOM state and keep the base recommendation path.
  }
}

function isMissingAiProfileTableError(error) {
  return Boolean(error?.code && AI_PROFILE_TABLE_MISSING_CODES.has(error.code));
}

async function attachAiProfilesToPosts(posts) {
  const ids = [...new Set((posts || []).map((post) => post?.id).filter(Boolean))];
  if (ids.length === 0) return posts || [];
  const { data, error } = await client
    .from("post_ai_profiles")
    .select("post_id, topics, emotions, tone, recommendation_vector, analysis_status")
    .in("post_id", ids);
  if (error) {
    if (!isMissingAiProfileTableError(error)) {
      reportClientDiagnostic("post-ai-profiles-load", error);
    }
    return posts || [];
  }
  const profilesByPostId = new Map((data || []).map((profile) => [profile.post_id, profile]));
  if (currentUser) {
    for (const post of posts || []) {
      if (!post?.id || post.user_id !== currentUser.id) continue;
      const profile = profilesByPostId.get(post.id);
      if (profile && profile.analysis_status !== "failed") continue;
      void requestPostAiAnalysis(post.id);
    }
  }
  return (posts || []).map((post) => ({
    ...post,
    ai_profile: profilesByPostId.get(post.id)?.analysis_status === "ready"
      ? profilesByPostId.get(post.id)
      : null,
  }));
}

function calculateRecommendedPostScore(post, signals = {}) {
  const ageDays = getPostAgeDays(post, signals.nowMs ?? Date.now());
  const moodPreference = getNormalizedMoodPreference(signals.moodScores || {}, post?.mood);
  const likes = getPostMetric(post, "likes_count");
  const comments = getPostMetric(post, "dislikes_count");
  const seenPostIds = signals.seenPostIds || new Set();
  const likedIds = signals.likedPostIds || new Set();
  const bookmarkedIds = signals.bookmarkedPostIds || new Set();
  const aiPreference = getAiRecommendationPreferenceScore(
    getPostAiTerms(post),
    signals.aiPreferenceScores || {},
  );
  const personalScore = moodPreference * 42 + aiPreference * 38 + (bookmarkedIds.has(post?.id) ? 12 : 0) + (likedIds.has(post?.id) ? 8 : 0);
  const engagementScore = clampRecommendationValue(Math.log1p(likes) * 8 + Math.log1p(comments) * 10, 0, 35);
  const freshnessScore = clampRecommendationValue(24 - ageDays * 5, 0, 24);
  const explorationScore = getDailyRecommendationJitter(post, signals.todaySeed) * 12 + (moodPreference === 0 ? 6 : 0);
  const seenPenalty = seenPostIds.has(post?.id) ? 75 : 0;
  const agePenalty = clampRecommendationValue(ageDays * 2.2, 0, 28);
  return personalScore + engagementScore + freshnessScore + explorationScore - seenPenalty - agePenalty;
}

function diversifyRecommendedPosts(scoredPosts, signals = {}) {
  const pool = [...scoredPosts];
  const result = [];
  while (pool.length > 0) {
    const recentAuthors = new Set(result.slice(-RECOMMENDATION_AUTHOR_DIVERSITY_WINDOW).map(({ post }) => getPostAuthorKey(post)).filter(Boolean));
    let pickIndex = 0;
    const alternativeIndex = pool.findIndex(({ post }, index) => index < RECOMMENDATION_AUTHOR_SEARCH_WINDOW && !recentAuthors.has(getPostAuthorKey(post)));
    if (alternativeIndex > 0 && pool[0].score - pool[alternativeIndex].score <= RECOMMENDATION_AUTHOR_SWAP_SCORE_GAP) {
      pickIndex = alternativeIndex;
    }
    result.push(pool.splice(pickIndex, 1)[0]);
  }
  return result.map(({ post }) => post);
}

function rankRecommendedPosts(posts, signals = {}) {
  const ranked = [...(posts || [])].map((post, index) => ({ post, index, score: calculateRecommendedPostScore(post, signals) })).sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    const rightCreatedAt = new Date(right.post?.created_at || 0).getTime() || 0;
    const leftCreatedAt = new Date(left.post?.created_at || 0).getTime() || 0;
    return rightCreatedAt !== leftCreatedAt ? rightCreatedAt - leftCreatedAt : left.index - right.index;
  });
  return diversifyRecommendedPosts(ranked, signals);
}

function getFeedRecommendationSignals() {
  return {
    moodScores: readStoredJson("glim_mood_scores", {}),
    seenPostIds: new Set(readStoredJson("glim_seen_posts", [])),
    likedPostIds,
    bookmarkedPostIds,
    aiPreferenceScores: readStoredJson(AI_RECOMMENDATION_SCORES_KEY, {}),
    nowMs: Date.now(),
    todaySeed: new Date().toISOString().slice(0, 10),
  };
}
// 유저의 감성 취향 점수를 로컬 스토리지에 누적하는 함수
function updateMoodScore(mood, points) {
  if (!mood) return;
  const scores = readStoredJson("glim_mood_scores", {});
  scores[mood] = (scores[mood] || 0) + points;
  localStorage.setItem("glim_mood_scores", JSON.stringify(scores));
} // <--- 🌟 여기서 updateMoodScore 함수를 닫아주세요!

// 유저가 읽은 글의 ID를 로컬스토리지에 저장하는 함수
function markPostAsSeen(postId) {
  if (!postId) return;
  const seenPosts = readStoredJson("glim_seen_posts", []);

  // 아직 안 읽은 글이라면 기록
  if (!seenPosts.includes(postId)) {
    seenPosts.push(postId);
    // 용량 관리를 위해 최근 300개까지만 기억
    if (seenPosts.length > 300) seenPosts.shift();
    localStorage.setItem("glim_seen_posts", JSON.stringify(seenPosts));
  }
}
// BGM 제목/아티스트 기본 표시 정보. Supabase에 bgm_title/bgm_artist가 있으면 그 값이 우선됩니다.
const BGM_TRACKS = [
  {
    url: "https://qdnpeliqtxdglqewbvgg.supabase.co/storage/v1/object/public/bgm/Paper%20Cup%20Piano.mp3",
    title: "Paper Cup Piano",
    artist: "GLIM",
  },
  {
    url: "https://qdnpeliqtxdglqewbvgg.supabase.co/storage/v1/object/public/bgm/Paper%20Boat%20After%20Rain.mp3",
    title: "Paper boat After Rain",
    artist: "GLIM",
  },
];
const MOOD_OPTIONS = [
  {
    value: "사색",
    label: "생각",
    description: "조용히 머무는 마음",
    icon: "psychology",
  },
  {
    value: "위로",
    label: "위로",
    description: "마음에 닿는 한마디",
    icon: "volunteer_activism",
  },
  {
    value: "우울",
    label: "우울",
    description: "비처럼 흐린 마음",
    icon: "water_drop",
  },
  {
    value: "설렘",
    label: "설렘",
    description: "살짝 뛰는 마음",
    icon: "auto_awesome",
  },
  {
    value: "일상",
    label: "일상",
    description: "문득 빛나는 하루",
    icon: "local_cafe",
  },
];
const BGM_TRACKS_BY_URL = new Map(
  BGM_TRACKS.map((track) => [track.url, track]),
);
const MOOD_OPTIONS_BY_VALUE = new Map(
  MOOD_OPTIONS.map((mood) => [mood.value, mood]),
);
const FEED_BGM_VIEW_IDS = new Set(["view-home", "view-context-feed"]);
const nativeAlert = window.alert.bind(window);
const nativePrompt = window.prompt.bind(window);
let isAppAlertReady = false;
let appAlertPreviousFocus = null;
let appAlertOnClose = null;
let appAlertOnConfirm = null;
let appAlertRequiredText = "";

const observerOptions = {
  root: document.querySelector("#view-home"),
  rootMargin: "0px",
  threshold: 0.6,
};

// 체류 시간과 가시성을 동시에 관리하는 통합 로직
function handleIntersection(entries, viewElement) {
  entries.forEach((entry) => {
    const postElement = entry.target;
    const postId = postElement.dataset.postId;
    const mood = postElement.dataset.mood;

    if (entry.isIntersecting) {
      postElement.classList.add("is-visible");

      // ✅ 화면에 보이면 타이머 시작
      if (postId) postViewTimers.set(postId, Date.now());
    } else {
      if (postElement.classList.contains("is-comment-source")) {
        postElement.classList.add("is-visible");
        return;
      }
      postElement.classList.remove("is-visible");

      // ✅ 화면에서 벗어나면 체류 시간 계산 후 점수 반영
      if (postId && postViewTimers.has(postId)) {
        const viewDuration = (Date.now() - postViewTimers.get(postId)) / 1000;
        postViewTimers.delete(postId);

        if (viewDuration >= 1) {
          markPostAsSeen(postId);
        }

        // 10초 이상 깊게 읽으면 3점, 3초 이상 읽으면 1점
        if (viewDuration >= 10 && mood) {
          updateMoodScore(mood, 3);
          updateAiPreferenceScoresFromElement(postElement, 2);
        } else if (viewDuration >= 3 && mood) {
          updateMoodScore(mood, 1);
          updateAiPreferenceScoresFromElement(postElement, 1);
        }
      }
    }
  });
  requestBgmSyncForView(viewElement);
}

const observer = new IntersectionObserver((entries) => {
  handleIntersection(entries, document.querySelector("#view-home"));
}, observerOptions);

const contextObserver = new IntersectionObserver(
  (entries) => {
    handleIntersection(entries, document.querySelector("#view-context-feed"));
  },
  {
    root: document.querySelector("#view-context-feed"),
    rootMargin: "0px",
    threshold: 0.6,
  },
);

// ✅ 날짜를 '방금 전', '몇 분 전' 등으로 포맷팅하는 함수 추가
function formatEngagementCount(value) {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  if (count >= 10000) {
    const tenThousands = Math.floor(count / 1000) / 10;
    return (Number.isInteger(tenThousands)
      ? String(tenThousands)
      : tenThousands.toFixed(1)) + "만";
  }
  return count.toLocaleString("en-US");
}

function timeForToday(value) {
  const today = new Date();
  const timeValue = new Date(value);
  const betweenTime = Math.floor(
    (today.getTime() - timeValue.getTime()) / 1000 / 60,
  );

  if (betweenTime < 1) return "방금 전";
  if (betweenTime < 60) return `${betweenTime}분 전`;

  const betweenTimeHour = Math.floor(betweenTime / 60);
  if (betweenTimeHour < 24) return `${betweenTimeHour}시간 전`;

  const betweenTimeDay = Math.floor(betweenTime / 60 / 24);
  if (betweenTimeDay < 8) return `${betweenTimeDay}일 전`;

  return `${timeValue.getFullYear()}.${timeValue.getMonth() + 1}.${timeValue.getDate()}`;
}

function fitPostTextToViewport(postElement) {
  const textElement = postElement.querySelector(".text-content");
  if (!textElement) return;

  textElement.style.fontSize = "";
  textElement.style.lineHeight = "";
  textElement.style.maxHeight = "";
  textElement.style.removeProperty("--home-text-lift");
  textElement.classList.remove(
    "text-content-scrollable",
    "text-content-tall",
  );

  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const computedStyle = getComputedStyle(textElement);
  const lineHeight = parseFloat(computedStyle.lineHeight);
  const renderedLines = Math.round(textElement.scrollHeight / lineHeight);
  const availableHeight = Math.max(
    Math.ceil(POST_REFERENCE_LINE_HEIGHT * POST_MAX_VISUAL_LINES) + 1,
    viewportHeight - 340,
  );

  if (viewportHeight <= 600 && renderedLines > POST_CENTERED_VISUAL_LINES) {
    const lift =
      (renderedLines - POST_CENTERED_VISUAL_LINES) * (lineHeight / 2);
    textElement.style.setProperty("--home-text-lift", `${-lift}px`);
    textElement.classList.add("text-content-tall");
  }

  if (textElement.scrollHeight > availableHeight) {
    textElement.style.maxHeight = `${availableHeight}px`;
    textElement.classList.add("text-content-scrollable");
  }
}

function fitAllPostTexts() {
  requestAnimationFrame(() => {
    document
      .querySelectorAll(".post")
      .forEach((postElement) => fitPostTextToViewport(postElement));
  });
}

function setupPostTextFitting() {
  let resizeTimer = null;
  const refit = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitAllPostTexts, 100);
  };

  window.addEventListener("resize", refit);
  window.visualViewport?.addEventListener("resize", refit);
  document.fonts?.ready.then(fitAllPostTexts);
}

function setGlobalHeaderView(viewId) {
  document
    .querySelector(".header")
    ?.classList.toggle("is-hidden", viewId !== "view-home");
}

function setBottomNavView(viewId) {
  const hiddenViews = new Set([
    "view-bgm-picker",
    "view-settings",
    "view-theme-settings",
    "view-notification-settings",
    "view-account-center",
    "view-account-delete",
    "view-privacy-policy",
    "view-terms-of-service",
    "view-support",
    "view-community-standards",
    "view-notice-detail",
  ]);
  document
    .querySelector(".bottom-nav")
    ?.classList.toggle("is-hidden", hiddenViews.has(viewId));
}

function getBgmDisplayName(bgmUrl) {
  if (!bgmUrl) return "BGM";

  const formatFilename = (filename) =>
    filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ") || "BGM";
  const decodeFilename = (filename) => {
    try {
      return decodeURIComponent(filename);
    } catch (_error) {
      return filename;
    }
  };

  try {
    const url = new URL(bgmUrl, window.location.href);
    return formatFilename(decodeFilename(url.pathname.split("/").pop() || ""));
  } catch (_error) {
    return formatFilename(
      decodeFilename(String(bgmUrl).split("/").pop() || ""),
    );
  }
}

function getBgmTrackInfo(post) {
  const fallbackTitle = getBgmDisplayName(post.bgm_url);
  const knownTrack = BGM_TRACKS_BY_URL.get(post.bgm_url);

  return {
    title:
      post.bgm_name || post.bgm_title || knownTrack?.title || fallbackTitle,
    artist:
      post.bgm_artist || post.artist || knownTrack?.artist || "아티스트 미상",
  };
}

function getBgmTrackByUrl(bgmUrl) {
  if (!bgmUrl) return null;

  return (
    BGM_TRACKS_BY_URL.get(bgmUrl) || {
      url: bgmUrl,
      title: getBgmDisplayName(bgmUrl),
      artist: "아티스트 미상",
    }
  );
}

function getBgmTrackLabel(track) {
  if (!track) return "음악 없이 고요하게";
  return `${track.title} - ${track.artist}`;
}

function updateSelectedBgmLabel() {
  const input = document.getElementById("postBgm");
  const label = document.getElementById("selectedBgmLabel");
  if (!input || !label) return;

  label.textContent = getBgmTrackLabel(getBgmTrackByUrl(input.value));
}

function renderBgmPicker() {
  const list = document.getElementById("bgmPickerList");
  const selectedUrl = document.getElementById("postBgm")?.value || "";
  if (!list) return;

  const options = [
    {
      url: "",
      title: "음악 없이 고요하게",
      artist: "",
    },
    ...BGM_TRACKS,
  ];

  list.innerHTML = options
    .map((track) => {
      const isSelected = selectedUrl === track.url;
      const isPreviewing = Boolean(track.url && previewingBgmUrl === track.url);
      const artistHtml = track.artist
        ? `<div class="bgm-picker-option-artist">${escapeHtml(track.artist)}</div>`
        : "";
      const previewControlHtml = track.url
        ? `<button
            type="button"
            class="bgm-picker-preview-btn${isPreviewing ? " is-previewing" : ""}"
            data-bgm-url="${escapeHtml(track.url)}"
            data-glim-click="toggle-bgm-preview"
            aria-label="${isPreviewing ? "미리듣기 정지" : "미리듣기"}"
          >
            <span class="material-symbols-outlined bgm-picker-preview-icon">${isPreviewing ? "pause" : "play_arrow"}</span>
          </button>`
        : `<span class="bgm-picker-preview-spacer" aria-hidden="true">
            <span class="material-symbols-outlined">music_off</span>
          </span>`;

      return `
        <div class="bgm-picker-option${isSelected ? " is-selected" : ""}${isPreviewing ? " is-previewing" : ""}">
          ${previewControlHtml}
          <button
            type="button"
            class="bgm-picker-select-btn"
            data-bgm-url="${escapeHtml(track.url)}"
            data-glim-click="select-post-bgm"
          >
            <div class="bgm-picker-option-text">
              <div class="bgm-picker-option-title">${escapeHtml(track.title)}</div>
              ${artistHtml}
            </div>
            <span class="material-symbols-outlined bgm-picker-option-icon">${isSelected ? "check_circle" : "radio_button_unchecked"}</span>
          </button>
        </div>`;
    })
    .join("");
}

function updateBgmPickerPreviewControls() {
  document.querySelectorAll(".bgm-picker-option").forEach((option) => {
    const button = option.querySelector(".bgm-picker-preview-btn");
    if (!button) return;

    const isPreviewing = previewingBgmUrl === button.dataset.bgmUrl;
    option.classList.toggle("is-previewing", isPreviewing);
    button.classList.toggle("is-previewing", isPreviewing);
    button.setAttribute(
      "aria-label",
      isPreviewing ? "미리듣기 정지" : "미리듣기",
    );

    const icon = button.querySelector(".bgm-picker-preview-icon");
    if (icon) icon.textContent = isPreviewing ? "pause" : "play_arrow";
  });
}

function stopBgmPreview() {
  if (!previewingBgmUrl) return;

  previewingBgmUrl = "";
  pauseBgm();
  updateBgmPickerPreviewControls();
}

function toggleBgmPreview(bgmUrl) {
  if (!bgmUrl) {
    stopBgmPreview();
    return;
  }

  if (previewingBgmUrl === bgmUrl) {
    stopBgmPreview();
    return;
  }

  previewingBgmUrl = bgmUrl;
  playBgmUrl(bgmUrl);
  updateBgmPickerPreviewControls();
}

function setupBgmPicker() {
  updateSelectedBgmLabel();
  renderBgmPicker();
}

function openBgmPicker() {
  renderBgmPicker();
  activateAppView("view-bgm-picker");
}

function closeBgmPicker() {
  stopBgmPreview();
  activateAppView("view-write");
}

function selectPostBgm(bgmUrl) {
  const input = document.getElementById("postBgm");
  if (!input) return;

  input.value = bgmUrl || "";
  updateSelectedBgmLabel();
  renderBgmPicker();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });
}

function normalizeProfileBio(value) {
  return Array.from(String(value ?? "").trim())
    .slice(0, PROFILE_BIO_MAX_LENGTH)
    .join("");
}

function getProfileBioLength(value) {
  return Array.from(String(value ?? "").trim()).length;
}

function isValidProfileTheme(value) {
  return Object.prototype.hasOwnProperty.call(PROFILE_THEMES, value);
}

function getSafeProfileTheme(value) {
  return isValidProfileTheme(value) ? value : "default";
}

function resetCurrentProfileState() {
  currentProfileNickname = "";
  currentProfileCustomId = "";
  currentProfileBio = "";
  currentProfileTheme = "default";
  selectedProfileTheme = "default";
}

function getCurrentEmailLocalPart() {
  return currentUser?.email?.split("@")[0] || "";
}

function getCurrentAuthorNickname() {
  return (
    currentProfileNickname ||
    currentUser?.user_metadata?.random_nickname ||
    getCurrentEmailLocalPart() ||
    "익명"
  );
}

function getCurrentAuthorCustomId() {
  return (
    currentProfileCustomId ||
    currentUser?.user_metadata?.custom_id ||
    getCurrentEmailLocalPart()
  );
}

function renderProfileBio(elementId, value) {
  const bio = normalizeProfileBio(value);
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = bio;
  element.hidden = !bio;
}

function updateProfileThemePicker() {
  document.querySelectorAll("[data-profile-theme-option]").forEach((option) => {
    const isSelected = option.dataset.profileThemeOption === selectedProfileTheme;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-pressed", String(isSelected));
    const check = option.querySelector(".profile-theme-option-check");
    if (check) {
      check.textContent = isSelected ? "check_circle" : "radio_button_unchecked";
    }
  });
}

function setSelectedProfileTheme(theme) {
  selectedProfileTheme = getSafeProfileTheme(theme);
  updateProfileThemePicker();
}

function applyProfileThemeToView(viewId, theme) {
  const view = document.getElementById(viewId);
  if (!view) return;
  PROFILE_THEME_VIEW_CLASSES.forEach((viewClass) => {
    view.classList.remove(viewClass);
  });
  view.classList.add(PROFILE_THEMES[getSafeProfileTheme(theme)].viewClass);
}

function applyOwnProfileTheme(theme) {
  applyProfileThemeToView("view-profile", theme);
}

function applyViewedProfileTheme(theme) {
  applyProfileThemeToView("view-user-profile", theme);
}

function prepareSwipeBackUnderlay(previousView) {
  if (previousView?.id === "view-profile") updateAuthUI();
}

function runDeclarativeAction(action, element, event) {
  const fixedActions = {
    "applyAvatarCrop()": () => applyAvatarCrop(),
    "cancelAvatarCropper()": () => cancelAvatarCropper(),
    "clearExploreSearchHistory()": () => clearExploreSearchHistory(),
    "closeAccountCenterView()": () => closeAccountCenterView(),
    "closeAccountDeleteView()": () => closeAccountDeleteView(),
    "closeBgmPicker()": () => closeBgmPicker(),
    "closeContextPostFeed()": () => closeContextPostFeed(),
    "closeExploreSearch()": () => closeExploreSearch(),
    "closeMoodPicker()": () => closeMoodPicker(),
    "closeNoticeDetail()": () => closeNoticeDetail(),
    "closeNotificationSettingsView()": () => closeNotificationSettingsView(),
    "closePrivacyPolicyView()": () => closePrivacyPolicyView(),
    "closeReportSheet()": () => closeReportSheet(),
    "closeSettingsView()": () => closeSettingsView(),
    "closeTermsOfServiceView()": () => closeTermsOfServiceView(),
    "closeSupportView()": () => closeSupportView(),
    "closeCommunityStandardsView()": () => closeCommunityStandardsView(),
    "closeThemeSettingsView()": () => closeThemeSettingsView(),
    "closeUserProfile()": () => closeUserProfile(),
    "closeSheet('blockedUsersSheet')": () => closeSheet("blockedUsersSheet"),
    "closeSheet('commentSheet')": () => closeSheet("commentSheet"),
    "closeSheet('editProfileSheet')": () => closeSheet("editProfileSheet"),
    "closeSheet('followListSheet')": () => closeSheet("followListSheet"),
    "closeSheet('noticeSheet')": () => closeSheet("noticeSheet"),
    "document.getElementById('editAvatarInput').click()": () =>
      document.getElementById("editAvatarInput")?.click(),
    "event.stopPropagation(); blockUser(viewedProfileUserId)": () => {
      event.stopPropagation();
      blockUser(viewedProfileUserId);
    },
    "event.stopPropagation(); reportUser(viewedProfileUserId)": () => {
      event.stopPropagation();
      reportUser(viewedProfileUserId);
    },
    "handleNavTap('explore')": () => handleNavTap("explore"),
    "handleNavTap('home')": () => handleNavTap("home"),
    "handleNavTap('noti')": () => handleNavTap("noti"),
    "handleNavTap('profile')": () => handleNavTap("profile"),
    "handleProfileAvatarChange(event)": () => handleProfileAvatarChange(event),
    "handleSignOut()": () => handleSignOut(),
    "handleSocialLogin('apple')": () => handleSocialLogin("apple"),
    "handleSocialLogin('google')": () => handleSocialLogin("google"),
    "handleSocialLogin('kakao')": () => handleSocialLogin("kakao"),
    "handleExploreSearchInput()": () => handleExploreSearchInput(event),
    "handlePostContentInput(event)": () => handlePostContentInput(event),
    "location.href = 'admin.html'": () =>
      window.location.assign(new URL("admin.html", window.location.href).href),
    "openAccountCenterView()": () => openAccountCenterView(),
    "openAccountDeleteView()": () => openAccountDeleteView(),
    "openBgmPicker()": () => openBgmPicker(),
    "openBlockedUsersSheet()": () => openBlockedUsersSheet(),
    "openEditProfile()": () => openEditProfile(),
    "openMoodPicker()": () => openMoodPicker(),
    "openMyFollowList('followers')": () => openMyFollowList("followers"),
    "openMyFollowList('following')": () => openMyFollowList("following"),
    "openNoticeSheet()": () => openNoticeSheet(),
    "openNotificationSettingsView()": () => openNotificationSettingsView(),
    "openPrivacyPolicyView()": () => openPrivacyPolicyView(),
    "openExploreSearch()": () => openExploreSearch(),
    "openSettingsView()": () => openSettingsView(),
    "openTermsOfServiceView()": () => openTermsOfServiceView(),
    "openSupportView()": () => openSupportView(),
    "openCommunityStandardsView()": () => openCommunityStandardsView(),
    "openThemeSettingsView()": () => openThemeSettingsView(),
    "openViewedFollowList('followers')": () => openViewedFollowList("followers"),
    "openViewedFollowList('following')": () => openViewedFollowList("following"),
    "removeProfileAvatar()": () => removeProfileAvatar(),
    "requestAccountDeletion()": () => requestAccountDeletion(),
    "saveProfile()": () => saveProfile(),
    "scrollToProfileTab(0)": () => scrollToProfileTab(0),
    "scrollToProfileTab(1)": () => scrollToProfileTab(1),
    "scrollToProfileTab(2)": () => scrollToProfileTab(2),
    "searchPosts()": () => searchPosts(),
    "setNotificationPreference('announcements', this.checked)": () =>
      setNotificationPreference("announcements", element.checked),
    "setNotificationPreference('comments', this.checked)": () =>
      setNotificationPreference("comments", element.checked),
    "setNotificationPreference('follows', this.checked)": () =>
      setNotificationPreference("follows", element.checked),
    "setNotificationPreference('likes', this.checked)": () =>
      setNotificationPreference("likes", element.checked),
    "setProfileTheme('default')": () => setSelectedProfileTheme("default"),
    "setThemePreference('dark')": () => setThemePreference("dark"),
    "setThemePreference('light')": () => setThemePreference("light"),
    "setThemePreference('system')": () => setThemePreference("system"),
    "showAppAlert('고객센터를 준비 중입니다.')": () => openSupportView(),
    "submitComment()": () => submitComment(),
    "submitPost()": () => submitPost(),
    "submitReport()": () => submitReport(),
    "switchTab('write')": () => switchTab("write"),
    "toggleFollow()": () => toggleFollow(),
    "toggleMoreMenu(this, event)": () => toggleMoreMenu(element, event),
    "togglePushNotifications(this.checked)": () =>
      togglePushNotifications(element.checked),
    "updateTabIndicator()": () => updateTabIndicator(),
  };
  const dynamicActions = {
    "toggle-bgm-preview": () => toggleBgmPreview(element.dataset.bgmUrl),
    "select-post-bgm": () => selectPostBgm(element.dataset.bgmUrl),
    "select-post-mood": () => selectPostMood(element.dataset.moodValue),
    "open-notification-target": () => openNotificationTarget(element),
  };
  const handler = fixedActions[action] || dynamicActions[action];
  if (!handler) {
    reportClientDiagnostic("declarative-action-unknown", { code: "unknown" });
    return;
  }
  return handler();
}

function setupDeclarativeEventHandlers() {
  const handle = (event, attribute) => {
    const element = event.target.closest?.(`[${attribute}]`);
    if (!element) return;
    const action = element.getAttribute(attribute);
    if (!action) return;
    runDeclarativeAction(action, element, event);
  };
  document.addEventListener("click", (event) =>
    handle(event, "data-glim-click"),
  );
  document.addEventListener("input", (event) =>
    handle(event, "data-glim-input"),
  );
  document.addEventListener("compositionend", (event) =>
    handle(event, "data-glim-input"),
  );
  document.addEventListener("change", (event) =>
    handle(event, "data-glim-change"),
  );
  document.addEventListener("focusin", (event) =>
    handle(event, "data-glim-focus"),
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      const enterElement = event.target.closest?.("[data-glim-enter]");
      if (enterElement) {
        event.preventDefault();
        runDeclarativeAction(
          enterElement.getAttribute("data-glim-enter"),
          enterElement,
          event,
        );
        return;
      }
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    const element = event.target.closest?.("[data-glim-keydown]");
    if (!element) return;
    event.preventDefault();
    runDeclarativeAction(
      element.getAttribute("data-glim-keydown"),
      element,
      event,
    );
  });
  document.addEventListener(
    "scroll",
    (event) => handle(event, "data-glim-scroll"),
    true,
  );
}

function setupAppAlert() {
  if (isAppAlertReady) return;

  const alertElement = document.getElementById("appAlert");
  if (!alertElement) return;

  window.alert = showAppAlert;
  isAppAlertReady = true;
  const verificationInput = document.getElementById(
    "appAlertVerificationInput",
  );

  alertElement.addEventListener("click", (event) => {
    const primaryTarget =
      event.target instanceof Element &&
      event.target.closest("[data-app-alert-primary]");
    const cancelTarget =
      event.target instanceof Element &&
      event.target.closest("[data-app-alert-cancel]");

    if (primaryTarget) {
      closeAppAlert(true);
    } else if (cancelTarget) {
      closeAppAlert(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && alertElement.classList.contains("open")) {
      closeAppAlert(false);
    }
  });

  verificationInput?.addEventListener(
    "input",
    updateAppAlertVerificationState,
  );
  verificationInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    updateAppAlertVerificationState();
    const primaryButton = alertElement.querySelector(
      "[data-app-alert-primary]",
    );
    if (!primaryButton?.disabled) closeAppAlert(true);
  });
}

function updateAppAlertVerificationState() {
  const alertElement = document.getElementById("appAlert");
  const input = document.getElementById("appAlertVerificationInput");
  const primaryButton = alertElement?.querySelector(
    "[data-app-alert-primary]",
  );
  const matches =
    !appAlertRequiredText ||
    input?.value.trim() === appAlertRequiredText;

  if (primaryButton) {
    primaryButton.disabled = !matches;
    primaryButton.setAttribute("aria-disabled", String(!matches));
  }
}

function setAppAlertVerification(requiredText = "", label = "") {
  const container = document.getElementById("appAlertVerification");
  const labelElement = document.getElementById("appAlertVerificationLabel");
  const input = document.getElementById("appAlertVerificationInput");
  appAlertRequiredText = String(requiredText ?? "").trim();
  const isRequired = Boolean(appAlertRequiredText);

  if (container) container.hidden = !isRequired;
  if (labelElement) {
    labelElement.textContent =
      label ||
      (isRequired
        ? `계속하려면 ‘${appAlertRequiredText}’를 입력해주세요.`
        : "");
  }
  if (input) {
    input.value = "";
    input.placeholder = isRequired ? appAlertRequiredText : "";
  }
  updateAppAlertVerificationState();
}

function setAppAlertPresentation({
  title,
  icon,
  primaryText,
  showCancel,
  isDestructive,
}) {
  const alertElement = document.getElementById("appAlert");
  const titleElement = document.getElementById("appAlertTitle");
  const iconElement = alertElement?.querySelector(".app-alert-icon");
  const primaryButton = alertElement?.querySelector(
    "[data-app-alert-primary]",
  );
  const cancelButton = alertElement?.querySelector("[data-app-alert-cancel]");

  if (titleElement) titleElement.textContent = title;
  if (iconElement) iconElement.textContent = icon;
  if (primaryButton) {
    primaryButton.textContent = primaryText;
    primaryButton.classList.toggle("is-destructive", isDestructive);
  }
  if (cancelButton) cancelButton.hidden = !showCancel;
}

function showAppAlert(message, onClose) {
  const alertElement = document.getElementById("appAlert");
  const messageElement = document.getElementById("appAlertMessage");
  const primaryButton = alertElement?.querySelector(
    "[data-app-alert-primary]",
  );

  if (!alertElement || !messageElement) {
    nativeAlert(String(message ?? ""));
    if (typeof onClose === "function") onClose();
    return;
  }

  appAlertPreviousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  appAlertOnClose = typeof onClose === "function" ? onClose : null;
  appAlertOnConfirm = null;
  setAppAlertPresentation({
    title: "알림",
    icon: "notifications",
    primaryText: "확인",
    showCancel: false,
    isDestructive: false,
  });
  setAppAlertVerification();
  messageElement.textContent = String(message ?? "");
  alertElement.classList.add("open");
  alertElement.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => {
    primaryButton?.focus({ preventScroll: true });
  });
}

function showAppConfirm(
  message,
  onConfirm,
  {
    title = "확인",
    icon = "help",
    confirmText = "확인",
    isDestructive = false,
    requiredText = "",
    verificationLabel = "",
  } = {},
) {
  const alertElement = document.getElementById("appAlert");
  const messageElement = document.getElementById("appAlertMessage");
  const primaryButton = alertElement?.querySelector(
    "[data-app-alert-primary]",
  );

  if (!alertElement || !messageElement) {
    if (requiredText) {
      const enteredText = nativePrompt(
        `${String(message ?? "")}\n\n계속하려면 ‘${requiredText}’를 입력해주세요.`,
      );
      if (enteredText?.trim() === requiredText) onConfirm?.();
    } else if (nativeConfirm(String(message ?? ""))) {
      onConfirm?.();
    }
    return;
  }

  appAlertPreviousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  appAlertOnClose = null;
  appAlertOnConfirm = typeof onConfirm === "function" ? onConfirm : null;
  setAppAlertPresentation({
    title,
    icon,
    primaryText: confirmText,
    showCancel: true,
    isDestructive,
  });
  setAppAlertVerification(requiredText, verificationLabel);
  messageElement.textContent = String(message ?? "");
  alertElement.classList.add("open");
  alertElement.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => {
    const verificationInput = document.getElementById(
      "appAlertVerificationInput",
    );
    if (appAlertRequiredText) {
      verificationInput?.focus({ preventScroll: true });
    } else {
      primaryButton?.focus({ preventScroll: true });
    }
  });
}

function showAppConfirmAsync(message, options = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    showAppConfirm(message, () => settle(true), options);
    const alertElement = document.getElementById("appAlert");
    if (!alertElement) {
      settle(false);
      return;
    }
    appAlertOnClose = () => settle(false);
  });
}

function closeAppAlert(confirmed = false) {
  const alertElement = document.getElementById("appAlert");
  if (!alertElement) return;
  const verificationInput = document.getElementById(
    "appAlertVerificationInput",
  );
  if (
    confirmed &&
    appAlertRequiredText &&
    verificationInput?.value.trim() !== appAlertRequiredText
  ) {
    verificationInput?.focus({ preventScroll: true });
    return;
  }

  const onClose = appAlertOnClose;
  const onConfirm = appAlertOnConfirm;
  const isConfirmDialog = typeof onConfirm === "function";

  alertElement.classList.remove("open");
  alertElement.setAttribute("aria-hidden", "true");
  appAlertOnClose = null;
  appAlertOnConfirm = null;

  if (
    appAlertPreviousFocus &&
    document.contains(appAlertPreviousFocus) &&
    alertElement.contains(document.activeElement)
  ) {
    appAlertPreviousFocus.focus({ preventScroll: true });
  }
  appAlertPreviousFocus = null;
  setAppAlertVerification();
  if (isConfirmDialog) {
    if (confirmed) {
      onConfirm();
    } else if (typeof onClose === "function") {
      onClose();
    }
  } else if (typeof onClose === "function") {
    onClose();
  }
}

function getMoodOption(value) {
  return MOOD_OPTIONS_BY_VALUE.get(value) || null;
}

function updateSelectedMoodLabel() {
  const input = document.getElementById("postMood");
  const label = document.getElementById("selectedMoodLabel");
  const button = document.getElementById("moodSelectButton");
  if (!input || !label) return;

  const selectedMood = getMoodOption(input.value);
  label.textContent = selectedMood?.label || "감성을 선택해주세요";
  button?.classList.toggle("has-value", Boolean(selectedMood));
}

function renderMoodPicker() {
  const list = document.getElementById("moodOptionList");
  const selectedMood = document.getElementById("postMood")?.value || "";
  if (!list) return;

  list.innerHTML = MOOD_OPTIONS.map((mood) => {
    const isSelected = selectedMood === mood.value;

    return `
      <button
        type="button"
        class="mood-option-btn${isSelected ? " is-selected" : ""}"
        data-mood-value="${escapeHtml(mood.value)}"
        data-glim-click="select-post-mood"
      >
        <span class="material-symbols-outlined mood-option-icon">${escapeHtml(mood.icon)}</span>
        <span class="mood-option-text">
          <span class="mood-option-title">${escapeHtml(mood.label)}</span>
          <span class="mood-option-desc">${escapeHtml(mood.description)}</span>
        </span>
        <span class="material-symbols-outlined mood-option-check">${isSelected ? "check_circle" : "radio_button_unchecked"}</span>
      </button>`;
  }).join("");
}

function openMoodPicker() {
  renderMoodPicker();
  openSheet("moodSheet");
}

function closeMoodPicker() {
  closeSheet("moodSheet");
}

function selectPostMood(moodValue) {
  const input = document.getElementById("postMood");
  if (!input) return;

  input.value = moodValue || "";
  updateSelectedMoodLabel();
  renderMoodPicker();
  closeMoodPicker();
}

function createPostBgmControl(post) {
  if (!post.bgm_url) return null;
  const { title, artist } = getBgmTrackInfo(post);
  const bgmLabel = `${title} - ${artist}`;
  const shouldScroll = bgmLabel.length > 26;

  const button = document.createElement("button");
  button.className = `post-bgm-info${isBgmEnabled ? " is-enabled" : ""}`;
  button.type = "button";
  button.dataset.bgmUrl = String(post.bgm_url);
  button.addEventListener("click", () => toggleBgmFromPost(button));

  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined bgm-toggle-icon icon-bgm";
  icon.textContent = isBgmEnabled ? "pause" : "play_arrow";

  const track = document.createElement("span");
  track.className = "bgm-track";
  const line = document.createElement("span");
  line.className = `bgm-line${shouldScroll ? " is-marquee" : ""}`;
  const label = document.createElement("span");
  label.className = "bgm-line-text";
  label.dataset.text = bgmLabel;
  label.textContent = bgmLabel;
  line.appendChild(label);
  track.appendChild(line);
  button.append(icon, track);
  return button;
}

function updateBgmControls() {
  document.querySelectorAll(".post-bgm-info").forEach((button) => {
    button.classList.toggle("is-enabled", isBgmEnabled);
    const icon = button.querySelector(".icon-bgm");
    if (icon) icon.textContent = isBgmEnabled ? "pause" : "play_arrow";
  });
}

function getActiveViewId() {
  return document.querySelector(".app-view.active")?.id || "";
}

function shouldResumeBgmAfterGesture() {
  const activeViewId = getActiveViewId();
  if (activeViewId === "view-bgm-picker") return Boolean(previewingBgmUrl);
  return isBgmEnabled && FEED_BGM_VIEW_IDS.has(activeViewId);
}

function pauseBgm() {
  const bgmPlayer = document.getElementById("bgmPlayer");
  if (!bgmPlayer) return;
  bgmPlayer.pause();
  currentPlayingBtn = null;
}

function pauseBgmForAppExit() {
  stopBgmPreview();
  pauseBgm();
}

function setupBgmAppExitPause() {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseBgmForAppExit();
  });
  window.addEventListener("pagehide", pauseBgmForAppExit);
  window.addEventListener("blur", pauseBgmForAppExit);
}

function resumeBgmAfterGesture() {
  isWaitingForBgmGesture = false;
  document.removeEventListener("pointerdown", resumeBgmAfterGesture);
  document.removeEventListener("touchstart", resumeBgmAfterGesture);
  document.removeEventListener("keydown", resumeBgmAfterGesture);

  if (!shouldResumeBgmAfterGesture()) return;

  if (getActiveViewId() === "view-bgm-picker") {
    playBgmUrl(previewingBgmUrl);
    updateBgmPickerPreviewControls();
    return;
  }

  syncBgmToVisiblePost();
}

function waitForBgmGesture() {
  if (isWaitingForBgmGesture) return;
  isWaitingForBgmGesture = true;
  document.addEventListener("pointerdown", resumeBgmAfterGesture, {
    passive: true,
  });
  document.addEventListener("touchstart", resumeBgmAfterGesture, {
    passive: true,
  });
  document.addEventListener("keydown", resumeBgmAfterGesture);
}

function setupBgmAudioUnlock() {
  waitForBgmGesture();

  const bgmPlayer = document.getElementById("bgmPlayer");
  if (!bgmPlayer) return;

  bgmPlayer.addEventListener("play", updateBgmPickerPreviewControls);
  bgmPlayer.addEventListener("pause", () => {
    if (getActiveViewId() !== "view-bgm-picker" || !previewingBgmUrl) return;
    previewingBgmUrl = "";
    updateBgmPickerPreviewControls();
  });
}

function playBgmUrl(bgmUrl) {
  const bgmPlayer = document.getElementById("bgmPlayer");
  if (!bgmPlayer) return;
  const trustedBgmUrl = getTrustedMediaUrl(bgmUrl);

  if (!trustedBgmUrl) {
    pauseBgm();
    currentBgmUrl = "";
    if (bgmUrl) reportClientDiagnostic("bgm-url-rejected");
    return;
  }

  if (currentBgmUrl !== trustedBgmUrl) {
    bgmPlayer.src = trustedBgmUrl;
    currentBgmUrl = trustedBgmUrl;
  }

  const playPromise = bgmPlayer.play();
  if (playPromise?.catch) {
    playPromise.catch(() => {
      if (shouldResumeBgmAfterGesture()) waitForBgmGesture();
    });
  }
}

function getActivePostInView(view) {
  if (!view) return null;

  const visiblePosts = Array.from(view.querySelectorAll(".post.is-visible"));
  const posts = visiblePosts.length
    ? visiblePosts
    : Array.from(view.querySelectorAll(".post"));
  if (!posts.length) return null;

  const viewRect = view.getBoundingClientRect();
  const viewCenterY = viewRect.top + viewRect.height / 2;

  return posts.reduce((closestPost, post) => {
    if (!closestPost) return post;
    const postCenterY =
      post.getBoundingClientRect().top +
      post.getBoundingClientRect().height / 2;
    const closestCenterY =
      closestPost.getBoundingClientRect().top +
      closestPost.getBoundingClientRect().height / 2;
    return Math.abs(postCenterY - viewCenterY) <
      Math.abs(closestCenterY - viewCenterY)
      ? post
      : closestPost;
  }, null);
}

function syncBgmToVisiblePost(
  view = document.querySelector(".app-view.active"),
) {
  if (!isBgmEnabled) return;

  const activeView = view?.classList.contains("active")
    ? view
    : document.querySelector(".app-view.active");
  if (!activeView || !FEED_BGM_VIEW_IDS.has(activeView.id)) return;

  const activePost = getActivePostInView(activeView);
  if (!activePost) return;

  playBgmUrl(activePost.dataset.bgmUrl || "");
  updateBgmControls();
}

function requestBgmSyncForView(view) {
  if (!isBgmEnabled) return;
  if (bgmSyncFrame) cancelAnimationFrame(bgmSyncFrame);
  bgmSyncFrame = requestAnimationFrame(() => {
    bgmSyncFrame = null;
    syncBgmToVisiblePost(view);
  });
}

function requestBgmSyncForActiveFeed(viewId) {
  if (bgmSyncFrame) {
    cancelAnimationFrame(bgmSyncFrame);
    bgmSyncFrame = null;
  }

  if (viewId !== "view-bgm-picker") stopBgmPreview();

  if (!FEED_BGM_VIEW_IDS.has(viewId)) {
    pauseBgm();
    return;
  }

  const view = document.getElementById(viewId);
  syncBgmToVisiblePost(view);
  requestBgmSyncForView(view);
}

function toggleBgmFromPost(button) {
  const bgmUrl = button?.dataset?.bgmUrl || "";
  if (!bgmUrl) return;

  isBgmEnabled = !isBgmEnabled;
  updateBgmControls();

  if (isBgmEnabled) {
    currentPlayingBtn = button.querySelector(".icon-bgm");
    playBgmUrl(bgmUrl);
  } else {
    pauseBgm();
  }
}

function toggleBgm(bgmUrl, btnElement) {
  if (!bgmUrl) return;

  isBgmEnabled = !isBgmEnabled;
  updateBgmControls();

  if (!isBgmEnabled) {
    pauseBgm();
    return;
  }

  currentPlayingBtn = btnElement;
  playBgmUrl(bgmUrl);
}

function switchTab(tabName) {
  if (tabName === "write" && !currentUser) {
    showAppAlert("글을 작성하려면 로그인이 필요합니다.", () => {
      switchTab("profile");
    });
    return;
  }
  document
    .querySelectorAll(".app-view")
    .forEach((view) => view.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((nav) => nav.classList.remove("active"));
  document.getElementById(`view-${tabName}`).classList.add("active");
  document.getElementById(`nav-${tabName}`).classList.add("active");
  setGlobalHeaderView(`view-${tabName}`);
  setBottomNavView(`view-${tabName}`);
  requestBgmSyncForActiveFeed(`view-${tabName}`);

  if (tabName === "home") fetchPosts();
  if (tabName === "explore") {
    closeExploreSearch();
    fetchExplorePosts("");
  }
  if (tabName === "noti") fetchNotifications();
  if (tabName === "profile") {
    updateAuthUI();
    if (currentUser) {
      loadProfileGrid("my");
      loadProfileGrid("bookmark");
      loadProfileGrid("like");
    }
  }
}

function generateRandomNickname() {
  const adjectives = [
    "조용한",
    "나른한",
    "새벽의",
    "몽환적인",
    "따뜻한",
    "비오는",
    "별빛내리는",
    "포근한",
    "은은한",
    "아스라한",
  ];
  const nouns = [
    "밤하늘",
    "고양이",
    "바람",
    "책방",
    "골목길",
    "가로등",
    "별자리",
    "커피",
    "여행자",
    "구름",
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 99) + 1;
  return `${adj} ${noun} ${num}`;
}

function hideAppSplash({ force = false } = {}) {
  if (appSplashFinished) return;
  const splash = document.getElementById("appSplash");
  if (!splash) {
    appSplashFinished = true;
    return;
  }

  const remainingTime = force
    ? 0
    : Math.max(0, APP_SPLASH_MIN_VISIBLE_MS - (Date.now() - appSplashStartedAt));
  clearTimeout(appSplashHideTimer);
  appSplashHideTimer = window.setTimeout(() => {
    if (appSplashFinished) return;
    appSplashFinished = true;
    splash.classList.add("is-hiding");
    window.setTimeout(() => splash.remove(), 560);
  }, remainingTime);
}

function updateConnectivityStatus() {
  const status = document.getElementById("connectivityStatus");
  if (!status) return;
  const isOffline = navigator.onLine === false;
  status.textContent = isOffline
    ? "연결이 끊겼습니다. 연결 후 다시 시도해주세요."
    : "";
  status.classList.toggle("is-visible", isOffline);
}

function setupConnectivityStatus() {
  window.addEventListener("offline", updateConnectivityStatus);
  window.addEventListener("online", updateConnectivityStatus);
  updateConnectivityStatus();
}

async function init() {
  setupDeclarativeEventHandlers();
  setupConnectivityStatus();
  setupThemePreferences();
  setupAppAlert();
  setupBgmAudioUnlock();
  setupBgmAppExitPause();
  setupAccountDeleteRequestForm();
  setupNativeAndroidViewport();
  setupCommentInputFocusState();
  setupCommentSheetOutsideDismiss();
  await setupNativeDeepLinks();
  await setupNativeBackNavigation();

  const {
    data: { session },
  } = await client.auth.getSession();
  currentUser = session?.user || null;
  if (!currentUser) resetCurrentProfileState();

  if (currentUser && !currentUser.user_metadata?.random_nickname) {
    const newNick = generateRandomNickname();
    await client.auth.updateUser({ data: { random_nickname: newNick } });
    currentUser.user_metadata.random_nickname = newNick;
  }

  await acceptPendingUgcPolicyAfterAuth();
  await syncCurrentUserProfile();
  await refreshCurrentUserRole();
  await loadBlockedUsersState();
  await loadEngagementState();
  updateAuthUI();
  initializePushNotifications().catch((error) => {
    reportClientDiagnostic("push-init", error);
  });
  await fetchPosts();
  await handleNotificationDeepLink();
  handlePublicStaticRoute();
  schedulePushOnboarding();

  client.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    resetCurrentProfileState();
    if (currentUser && !currentUser.user_metadata?.random_nickname) {
      const newNick = generateRandomNickname();
      await client.auth.updateUser({ data: { random_nickname: newNick } });
      currentUser.user_metadata.random_nickname = newNick;
    }
    await syncCurrentUserProfile();
    await refreshCurrentUserRole();
    await loadBlockedUsersState();
    await loadEngagementState();
    updateAuthUI();
    await promptForUgcPolicyAcceptanceAfterSignIn();
    initializePushNotifications().catch((error) => {
      reportClientDiagnostic("push-init-auth-change", error);
    });
    schedulePushOnboarding();
  });

  [
    "commentSheet",
    "noticeSheet",
    "editProfileSheet",
    "followListSheet",
    "blockedUsersSheet",
    "moodSheet",
    "reportSheet",
  ].forEach((sheetId) => {
    const sheet = document.getElementById(sheetId);
    let touchStartY = 0;
    let touchCurrentY = 0;
    let isDraggingSheet = false;
    let isTouchTracking = false;
    let scrollContainer = null;

    const resetSheetTouch = () => {
      touchStartY = 0;
      touchCurrentY = 0;
      isDraggingSheet = false;
      isTouchTracking = false;
      scrollContainer = null;
    };

    sheet.addEventListener(
      "touchstart",
      (e) => {
        resetSheetTouch();
        if (
          e.target.closest(".profile-menu-row, .report-reason-option") ||
          e.target.closest("input, textarea, button")
        )
          return;

        scrollContainer = e.target.closest(
          ".comment-list, #noticeList, #followList, .sheet-scroll, .report-sheet-body",
        );
        touchStartY = e.touches[0].clientY;
        touchCurrentY = touchStartY;
        isTouchTracking = true;
      },
      { passive: true },
    );
    sheet.addEventListener(
      "touchmove",
      (e) => {
        if (!isTouchTracking) return;
        touchCurrentY = e.touches[0].clientY;
        const deltaY = touchCurrentY - touchStartY;
        const canDragSheet =
          deltaY > 0 && (!scrollContainer || scrollContainer.scrollTop <= 0);

        if (canDragSheet) {
          e.preventDefault();
          isDraggingSheet = true;
          sheet.style.transition = "none";
          sheet.style.transform = `translateY(${deltaY}px)`;
        } else if (isDraggingSheet) {
          sheet.style.transform = `translateY(${Math.max(deltaY, 0)}px)`;
        }
      },
      { passive: false },
    );
    sheet.addEventListener("touchend", () => {
      if (!isTouchTracking) return;
      const deltaY = touchCurrentY - touchStartY;
      sheet.style.transition =
        "bottom 0.4s cubic-bezier(0.25, 1, 0.5, 1), transform 0.2s ease";
      sheet.style.transform = "";
      if (isDraggingSheet && deltaY > 100) closeSheet(sheetId);
      resetSheetTouch();
    });
    sheet.addEventListener("touchcancel", () => {
      sheet.style.transition =
        "bottom 0.4s cubic-bezier(0.25, 1, 0.5, 1), transform 0.2s ease";
      sheet.style.transform = "";
      resetSheetTouch();
    });
  });

  setupSwipeBackNavigation();
  setupPullToRefresh();
  setupPostTextFitting();
  window.addEventListener("resize", updateExploreCardMoreLabels);
  setupAvatarCropper();
  setupBgmPicker();
  updateCharCount();
}

function activateAppView(viewId) {
  setGlobalHeaderView(viewId);
  setBottomNavView(viewId);
  document
    .querySelectorAll(".app-view")
    .forEach((view) => view.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((nav) => nav.classList.remove("active"));

  document.getElementById(viewId)?.classList.add("active");
  const tabName = viewId.replace("view-", "");
  document.getElementById(`nav-${tabName}`)?.classList.add("active");
  requestBgmSyncForActiveFeed(viewId);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function setRefreshHeaderHidden(isHidden) {
  document
    .querySelector(".header")
    ?.classList.toggle("is-refresh-hidden", isHidden);
}

function showPullRefreshIndicator(distance) {
  if (isRefreshing) return;
  const indicator = document.getElementById("refreshIndicator");
  const icon = document.getElementById("refreshIndicatorIcon");
  const text = document.getElementById("refreshIndicatorText");

  setRefreshHeaderHidden(true);
  indicator.classList.add("visible", "pulling");

  // 당기는 거리에 따라 글리머가 점점 커지도록 변경 (최대 1.1배)
  const scaleValue = Math.min(0.5 + distance / 120, 1.1);
  icon.style.transform = `scale(${scaleValue})`;

  // 당기는 거리에 따른 문구 변경
  text.innerText = distance >= 80 ? "놓아서 글리머 깨우기" : "하품하는 중...";

  clearTimeout(pullIndicatorHideTimer);
  pullIndicatorHideTimer = setTimeout(forceHideRefreshIndicator, 1200);
}

function hidePullRefreshIndicator() {
  clearTimeout(pullIndicatorHideTimer);
  pullIndicatorHideTimer = null;
  if (isRefreshing) return;
  setRefreshHeaderHidden(false);
  const indicator = document.getElementById("refreshIndicator");
  const icon = document.getElementById("refreshIndicatorIcon");
  indicator.classList.remove("visible", "pulling");
  icon.style.transform = "";
}

function resetRefreshViewPosition(view, animate = true) {
  if (!view) return;
  view.style.willChange = "";
  view.style.transition = animate
    ? "transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)"
    : "none";
  view.style.transform = "";
  setTimeout(() => {
    if (!view.style.transform) view.style.transition = "";
  }, 400);
}

function resetAllRefreshViewPositions(animate = true) {
  [
    ...["home", "explore", "noti", "profile"].map((tabName) =>
      document.getElementById(`view-${tabName}`),
    ),
    document.getElementById("exploreDiscoveryContent"),
    document.getElementById("exploreSearchContent"),
  ].forEach((target) => resetRefreshViewPosition(target, animate));
}

function forceHideRefreshIndicator() {
  const indicator = document.getElementById("refreshIndicator");
  const icon = document.getElementById("refreshIndicatorIcon");
  indicator?.classList.remove("visible", "pulling", "refreshing", "complete");
  if (icon) icon.style.transform = "";
  setRefreshHeaderHidden(false);
  refreshPullInterruptors.forEach((interrupt) => interrupt());
  resetAllRefreshViewPositions(false);
}

async function refreshTab(tabName) {
  if (isRefreshing || !["home", "explore", "noti", "profile"].includes(tabName))
    return;

  isRefreshing = true;
  const indicator = document.getElementById("refreshIndicator");
  const icon = document.getElementById("refreshIndicatorIcon");
  const text = document.getElementById("refreshIndicatorText");
  const view = document.getElementById(`view-${tabName}`);
  const startedAt = Date.now();
  const refreshSafetyTimer = setTimeout(forceHideRefreshIndicator, 8000);

  clearTimeout(pullIndicatorHideTimer);
  pullIndicatorHideTimer = null;
  setRefreshHeaderHidden(true);
  indicator.classList.remove("pulling", "complete");
  indicator.classList.add("visible", "refreshing");

  icon.style.transform = ""; // 커졌던 크기를 원래대로 되돌림
  // 삭제됨: icon.innerText = "refresh"; (이미지 태그 보호)
  text.innerText = "불러오는 중...";

  view?.scrollTo({ top: 0, behavior: "smooth" });

  try {
    if (tabName === "home") {
      await fetchPosts();
    } else if (tabName === "explore") {
      await refreshExploreCurrentContent();
    } else if (tabName === "noti") {
      await fetchNotifications();
    } else if (tabName === "profile") {
      await syncCurrentUserProfile();
      updateAuthUI();
      if (currentUser) {
        await Promise.all([
          loadProfileGrid("my"),
          loadProfileGrid("bookmark"),
          loadProfileGrid("like"),
          loadMyFollowStats(),
        ]);
      }
    }

    const remainingTime = 650 - (Date.now() - startedAt);
    if (remainingTime > 0) await wait(remainingTime);

    indicator.classList.remove("refreshing");
    indicator.classList.add("complete");
    // 삭제됨: icon.innerText = "check";
    text.innerText = "새로고침 완료";
    await wait(650);
  } finally {
    clearTimeout(refreshSafetyTimer);
    indicator.classList.remove("visible", "refreshing", "complete");
    // 삭제됨: icon.innerText = "refresh";
    icon.style.transform = "";
    resetRefreshViewPosition(view);
    await wait(420);
    setRefreshHeaderHidden(false);
    isRefreshing = false;
  }
}

function setupPullToRefresh() {
  const refreshableViews = {
    home: document.getElementById("view-home"),
    explore: document.getElementById("view-explore"),
    noti: document.getElementById("view-noti"),
    profile: document.getElementById("view-profile"),
  };

  Object.entries(refreshableViews).forEach(([tabName, view]) => {
    let touchStartX = 0;
    let touchStartY = 0;
    let pullDistance = 0;
    let isTracking = false;
    let pullAnimationFrame = null;
    let pendingPullOffset = 0;
    let pullTarget = view;

    const queuePullPosition = (distance) => {
      const safeDistance = Math.max(0, distance);
      pendingPullOffset = Math.min(
        68,
        74 * (1 - Math.exp(-safeDistance / 108)),
      );
      if (pullAnimationFrame !== null) return;

      pullAnimationFrame = window.requestAnimationFrame(() => {
        pullAnimationFrame = null;
        pullTarget.style.transition = "none";
        pullTarget.style.willChange = "transform";
        pullTarget.style.transform = `translate3d(0, ${pendingPullOffset.toFixed(2)}px, 0)`;
      });
    };

    const finishPullPosition = () => {
      if (pullAnimationFrame !== null) {
        window.cancelAnimationFrame(pullAnimationFrame);
        pullAnimationFrame = null;
      }
      resetRefreshViewPosition(pullTarget);
    };

    const interruptPull = () => {
      if (!isTracking && pullAnimationFrame === null) return;
      isTracking = false;
      pullDistance = 0;
      pendingPullOffset = 0;
      if (pullAnimationFrame !== null) {
        window.cancelAnimationFrame(pullAnimationFrame);
        pullAnimationFrame = null;
      }
      resetRefreshViewPosition(pullTarget, false);
      pullTarget = view;
    };
    refreshPullInterruptors.add(interruptPull);

    view.addEventListener(
      "touchstart",
      (event) => {
        if (isRefreshing || view.scrollTop > 2) return;
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
        pullDistance = 0;
        isTracking = true;
        pullTarget =
          tabName === "explore"
            ? document.getElementById(
                isExploreSearchOpen
                  ? "exploreSearchContent"
                  : "exploreDiscoveryContent",
              ) || view
            : view;
      },
      { passive: true },
    );

    view.addEventListener(
      "touchmove",
      (event) => {
        if (!isTracking) return;
        const deltaX = event.touches[0].clientX - touchStartX;
        const deltaY = event.touches[0].clientY - touchStartY;

        if (deltaY <= 0 || Math.abs(deltaY) <= Math.abs(deltaX)) {
          pullDistance = 0;
          finishPullPosition();
          hidePullRefreshIndicator();
          return;
        }

        event.preventDefault();
        pullDistance = deltaY;
        setRefreshHeaderHidden(true);
        queuePullPosition(deltaY);
        if (pullDistance > 12) showPullRefreshIndicator(pullDistance);
      },
      { passive: false },
    );

    view.addEventListener(
      "touchend",
      () => {
        if (!isTracking) return;
        isTracking = false;
        finishPullPosition();
        if (pullDistance >= 80) refreshTab(tabName);
        else hidePullRefreshIndicator();
        pullDistance = 0;
        pullTarget = view;
      },
      { passive: true },
    );

    view.addEventListener(
      "touchcancel",
      () => {
        isTracking = false;
        pullDistance = 0;
        finishPullPosition();
        hidePullRefreshIndicator();
        pullTarget = view;
      },
      { passive: true },
    );

    view.addEventListener(
      "scroll",
      () => {
        if (!isRefreshing) hidePullRefreshIndicator();
      },
      { passive: true },
    );
  });

  window.addEventListener("blur", forceHideRefreshIndicator);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) forceHideRefreshIndicator();
  });
}

function getCurrentProfileData() {
  if (!currentUser) return null;

  return {
    id: currentUser.id,
    nickname: getCurrentAuthorNickname(),
    custom_id: getCurrentAuthorCustomId(),
    avatar_url: normalizePersistedAvatarUrl(
      currentUser.user_metadata?.avatar_url,
    ),
    bio: normalizeProfileBio(currentProfileBio),
    theme: getSafeProfileTheme(currentProfileTheme),
    updated_at: new Date().toISOString(),
  };
}

function getLegacyProfilePersistenceData(profile) {
  return {
    id: profile.id,
    nickname: profile.nickname,
    custom_id: profile.custom_id,
    avatar_url: profile.avatar_url,
    updated_at: profile.updated_at,
  };
}

async function persistLegacyCurrentUserProfile(profile) {
  const legacyProfile = getLegacyProfilePersistenceData(profile);
  const { id, ...legacyUpdate } = legacyProfile;
  const { count, error: updateError } = await client
    .from("profiles")
    .update(legacyUpdate, { count: "exact" })
    .eq("id", id);

  if (updateError) return { error: updateError };
  if (count !== 0) return { error: null };

  const { error: insertError } = await client
    .from("profiles")
    .insert(legacyProfile);
  return { error: insertError || null };
}

async function persistCurrentUserProfileAppearance(profile) {
  const { error } = await client
    .from("profiles")
    .update({
      bio: profile.bio,
      theme: profile.theme,
      updated_at: profile.updated_at,
    })
    .eq("id", profile.id);

  if (!error) return { error: null };

  if (isMissingProfileAppearanceColumnError(error)) {
    reportClientDiagnostic("profile-appearance-columns-missing", error);
  } else {
    reportClientDiagnostic("profile-appearance-sync", error);
  }

  return { error };
}

async function syncCurrentUserProfile({
  preserveStoredAvatar = true,
  requirePersistence = false,
} = {}) {
  const profile = getCurrentProfileData();
  if (!profile) {
    resetCurrentProfileState();
    return;
  }

  if (preserveStoredAvatar) {
    let { data: storedProfile, error: readError } = await client
      .from("profiles")
      .select("nickname, custom_id, avatar_url, bio, theme")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (isMissingProfileAppearanceColumnError(readError)) {
      reportClientDiagnostic("profile-appearance-columns-missing", readError);
      ({ data: storedProfile, error: readError } = await client
        .from("profiles")
        .select("nickname, custom_id, avatar_url")
        .eq("id", currentUser.id)
        .maybeSingle());
    }

    if (!readError && storedProfile) {
      profile.nickname = storedProfile.nickname || profile.nickname;
      profile.custom_id = storedProfile.custom_id || profile.custom_id;
      profile.avatar_url = normalizePersistedAvatarUrl(
        storedProfile.avatar_url,
      );
      profile.bio = normalizeProfileBio(storedProfile.bio);
      profile.theme = getSafeProfileTheme(storedProfile.theme);
    }
  }

  profile.nickname = String(profile.nickname || getCurrentAuthorNickname());
  profile.custom_id = String(profile.custom_id || getCurrentAuthorCustomId());
  profile.avatar_url = normalizePersistedAvatarUrl(profile.avatar_url);
  profile.bio = normalizeProfileBio(profile.bio);
  profile.theme = getSafeProfileTheme(profile.theme);
  currentProfileNickname = profile.nickname;
  currentProfileCustomId = profile.custom_id;
  currentProfileBio = profile.bio;
  currentProfileTheme = profile.theme;
  currentUser.user_metadata = {
    ...currentUser.user_metadata,
    random_nickname: profile.nickname,
    custom_id: profile.custom_id,
    avatar_url: profile.avatar_url,
  };

  const { error } = await persistLegacyCurrentUserProfile(profile);
  if (error) {
    reportClientDiagnostic("profile-sync", error);
    if (requirePersistence) throw createProfilePersistenceError(error);
    return;
  }

  const { error: appearanceError } =
    await persistCurrentUserProfileAppearance(profile);
  if (appearanceError && requirePersistence) {
    throw createProfilePersistenceError(appearanceError);
  }
}

async function refreshCurrentUserRole() {
  currentUserIsModerator = false;
  if (!currentUser) return;

  const { data, error } = await client.rpc("is_moderator");
  if (error) {
    reportClientDiagnostic("moderator-role-check", error);
    return;
  }

  currentUserIsModerator = data === true;
}

function getLegacyEngagementIds(prefix) {
  const ids = [];
  const keyPrefix = `${prefix}_${currentUser?.id || ""}_`;
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(keyPrefix)) continue;
    const id = key.slice(keyPrefix.length);
    if (uuidPattern.test(id)) ids.push({ id, key });
  }
  return ids;
}

async function migrateLegacyEngagementState() {
  if (!currentUser) return;
  const migrationKey = `${ENGAGEMENT_MIGRATION_STORAGE_PREFIX}_${currentUser.id}`;
  if (localStorage.getItem(migrationKey) === "true") return;

  const migrations = [
    ...getLegacyEngagementIds("liked").map(({ id, key }) => ({
      functionName: "import_legacy_post_like",
      parameterName: "target_post_id",
      id,
      key,
    })),
    ...getLegacyEngagementIds("bookmarked").map(({ id, key }) => ({
      functionName: "import_legacy_bookmark",
      parameterName: "target_post_id",
      id,
      key,
    })),
    ...getLegacyEngagementIds("comment_liked").map(({ id, key }) => ({
      functionName: "import_legacy_comment_like",
      parameterName: "target_comment_id",
      id,
      key,
    })),
  ];

  for (let index = 0; index < migrations.length; index += 10) {
    const batch = migrations.slice(index, index + 10);
    const results = await Promise.all(
      batch.map((migration) =>
        client.rpc(migration.functionName, {
          [migration.parameterName]: migration.id,
        }),
      ),
    );
    const failedResult = results.find((result) => result.error);
    if (failedResult) {
      reportClientDiagnostic("engagement-migration", failedResult.error);
      return;
    }
    batch.forEach((migration) => localStorage.removeItem(migration.key));
  }

  localStorage.setItem(migrationKey, "true");
}

async function loadEngagementState() {
  likedPostIds.clear();
  bookmarkedPostIds.clear();
  likedCommentIds.clear();
  if (!currentUser) return;

  await migrateLegacyEngagementState();
  const [postLikesResult, bookmarksResult, commentLikesResult] =
    await Promise.all([
      client.from("post_likes").select("post_id"),
      client.from("bookmarks").select("post_id"),
      client.from("comment_likes").select("comment_id"),
    ]);

  if (postLikesResult.error) {
    reportClientDiagnostic("post-likes-load", postLikesResult.error);
  } else {
    (postLikesResult.data || []).forEach(({ post_id: postId }) =>
      likedPostIds.add(postId),
    );
  }

  if (bookmarksResult.error) {
    reportClientDiagnostic("bookmarks-load", bookmarksResult.error);
  } else {
    (bookmarksResult.data || []).forEach(({ post_id: postId }) =>
      bookmarkedPostIds.add(postId),
    );
  }

  if (commentLikesResult.error) {
    reportClientDiagnostic("comment-likes-load", commentLikesResult.error);
  } else {
    (commentLikesResult.data || []).forEach(({ comment_id: commentId }) =>
      likedCommentIds.add(commentId),
    );
  }
}

async function loadBlockedUsersState() {
  blockedUserIds.clear();
  blockedUserNicknames.clear();
  if (!currentUser) return;

  const { data: blocks, error } = await client
    .from("blocks")
    .select("blocked_id")
    .eq("blocker_id", currentUser.id);
  if (error) {
    reportClientDiagnostic("blocks-load", error);
    return;
  }

  const userIds = (blocks || []).map((block) => block.blocked_id);
  userIds.forEach((userId) => blockedUserIds.add(userId));
  if (!userIds.length) return;

  const { data: profiles } = await client
    .from("profiles")
    .select("id, nickname")
    .in("id", userIds);
  (profiles || []).forEach((profile) => {
    if (profile.nickname) blockedUserNicknames.add(profile.nickname);
  });
}

function filterBlockedPosts(posts) {
  if (!Array.isArray(posts) || !blockedUserIds.size) return posts || [];
  return posts.filter(
    (post) => !post.user_id || !blockedUserIds.has(post.user_id),
  );
}

function filterBlockedComments(comments) {
  if (!Array.isArray(comments) || !blockedUserIds.size) return comments || [];
  return comments.filter(
    (comment) =>
      (!comment.user_id || !blockedUserIds.has(comment.user_id)) &&
      (!comment.user_email ||
        !blockedUserNicknames.has(comment.user_email.split("@")[0])),
  );
}

async function getFollowCounts(userId) {
  const [followersResult, followingResult] = await Promise.all([
    client
      .from("follows")
      .select("follower_id", { count: "exact", head: true })
      .eq("following_id", userId),
    client
      .from("follows")
      .select("following_id", { count: "exact", head: true })
      .eq("follower_id", userId),
  ]);

  return {
    followers: followersResult.count || 0,
    following: followingResult.count || 0,
  };
}

async function loadMyFollowStats() {
  if (!currentUser) return;
  const counts = await getFollowCounts(currentUser.id);
  document.getElementById("statFollowers").innerText = counts.followers;
  document.getElementById("statFollowing").innerText = counts.following;
}

function renderAvatarElement(avatar, avatarUrl, iconSize = "3rem") {
  if (!avatar) return;
  avatar.replaceChildren();

  const image = document.createElement("img");
  image.src = avatarUrl || DEFAULT_PROFILE_AVATAR_URL;
  image.alt = "";
  image.style.cssText = "width:100%; height:100%; object-fit:cover;";
  image.addEventListener("error", () => {
    if (image.dataset.defaultFallback !== "true") {
      image.dataset.defaultFallback = "true";
      image.src = DEFAULT_PROFILE_AVATAR_URL;
      return;
    }

    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined";
    icon.style.cssText = `font-size:${iconSize}; color:#555;`;
    icon.innerText = "person";
    avatar.replaceChildren(icon);
  });
  avatar.appendChild(image);
}

function normalizePersistedAvatarUrl(avatarUrl) {
  const value = typeof avatarUrl === "string" ? avatarUrl.trim() : "";
  if (!value) return DEFAULT_PROFILE_AVATAR_URL;

  if (
    value === DEFAULT_PROFILE_AVATAR_URL ||
    /\/image\/glimmer-profile-image\.png(?:[?#].*)?$/.test(value)
  ) {
    return DEFAULT_PROFILE_AVATAR_URL;
  }

  return value.includes(PROFILE_AVATAR_STORAGE_PATH)
    ? value
    : DEFAULT_PROFILE_AVATAR_URL;
}

function setOwnProfileAvatar(avatarUrl) {
  renderAvatarElement(document.getElementById("profileAvatar"), avatarUrl);
}

function setViewedProfileAvatar(avatarUrl) {
  renderAvatarElement(
    document.getElementById("viewedProfileAvatar"),
    avatarUrl,
  );
}

function setEditProfileAvatarPreview(avatarUrl) {
  renderAvatarElement(document.getElementById("editAvatarPreview"), avatarUrl);
}

function getCurrentAvatarUrl() {
  return normalizePersistedAvatarUrl(
    currentUser?.user_metadata?.avatar_url,
  );
}

function getAvatarCropElements() {
  return {
    sheet: document.getElementById("avatarCropSheet"),
    backdrop: document.getElementById("avatarCropSheetBackdrop"),
    stage: document.getElementById("avatarCropStage"),
    frame: document.getElementById("avatarCropFrame"),
    image: document.getElementById("avatarCropImage"),
    zoom: document.getElementById("avatarCropZoom"),
    input: document.getElementById("editAvatarInput"),
  };
}

function clampValue(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setupAvatarCropper() {
  const { stage, zoom } = getAvatarCropElements();
  if (!stage || !zoom) return;

  stage.addEventListener("pointerdown", startAvatarCropDrag);
  stage.addEventListener("pointermove", moveAvatarCropDrag);
  stage.addEventListener("pointerup", endAvatarCropDrag);
  stage.addEventListener("pointercancel", endAvatarCropDrag);
  stage.addEventListener("wheel", handleAvatarCropWheel, { passive: false });

  zoom.addEventListener("input", () => {
    setAvatarCropScale(parseFloat(zoom.value));
  });

  window.addEventListener("resize", () => {
    if (!avatarCropOriginalFile) return;
    requestAnimationFrame(measureAvatarCropper);
  });
}

function openAvatarCropSheet() {
  const { sheet, backdrop } = getAvatarCropElements();
  sheet?.classList.add("open");
  backdrop?.classList.add("open");
}

function closeAvatarCropper(resetInput = true) {
  const { sheet, backdrop, image, input } = getAvatarCropElements();
  sheet?.classList.remove("open");
  backdrop?.classList.remove("open");

  if (image) {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute("src");
    image.style.cssText = "";
  }

  if (avatarCropSourceUrl) {
    URL.revokeObjectURL(avatarCropSourceUrl);
    avatarCropSourceUrl = null;
  }

  avatarCropOriginalFile = null;
  avatarCropState.naturalWidth = 0;
  avatarCropState.naturalHeight = 0;
  avatarCropState.stageSize = 0;
  avatarCropState.cropSize = 0;
  avatarCropState.minScale = 1;
  avatarCropState.maxScale = 4;
  avatarCropState.scale = 1;
  avatarCropState.x = 0;
  avatarCropState.y = 0;
  avatarCropState.isDragging = false;
  avatarCropState.pointerId = null;
  avatarCropState.pinchStartDistance = 0;
  avatarCropPointers.clear();
  avatarCropState.isReady = false;

  if (resetInput && input) input.value = "";
}

function cancelAvatarCropper() {
  closeAvatarCropper(true);
}

function openAvatarCropper(file) {
  closeAvatarCropper(false);
  const { image } = getAvatarCropElements();
  if (!image) return;

  avatarCropOriginalFile = file;
  avatarCropSourceUrl = URL.createObjectURL(file);

  image.onload = () => {
    avatarCropState.naturalWidth = image.naturalWidth;
    avatarCropState.naturalHeight = image.naturalHeight;
    avatarCropState.x = 0;
    avatarCropState.y = 0;
    avatarCropState.scale = 0;
    avatarCropState.isReady = true;
    openAvatarCropSheet();
    requestAnimationFrame(measureAvatarCropper);
  };
  image.onerror = () => {
    closeAvatarCropper(true);
    alert("이미지를 불러오지 못했습니다. 다른 사진을 선택해주세요.");
  };
  image.src = avatarCropSourceUrl;
}

function measureAvatarCropper() {
  const { stage, frame, zoom } = getAvatarCropElements();
  if (!stage || !frame || !zoom || !avatarCropState.isReady) return;

  avatarCropState.stageSize = stage.getBoundingClientRect().width;
  avatarCropState.cropSize = frame.getBoundingClientRect().width;
  avatarCropState.minScale =
    avatarCropState.cropSize /
    Math.min(avatarCropState.naturalWidth, avatarCropState.naturalHeight);
  avatarCropState.maxScale = avatarCropState.minScale * 4;
  avatarCropState.scale = clampValue(
    avatarCropState.scale || avatarCropState.minScale,
    avatarCropState.minScale,
    avatarCropState.maxScale,
  );

  zoom.min = avatarCropState.minScale;
  zoom.max = avatarCropState.maxScale;
  zoom.step = (avatarCropState.maxScale - avatarCropState.minScale) / 300;
  zoom.value = avatarCropState.scale;

  clampAvatarCropOffset();
  renderAvatarCropImage();
}

function renderAvatarCropImage() {
  const { image } = getAvatarCropElements();
  if (!image || !avatarCropState.isReady) return;

  image.style.width = `${avatarCropState.naturalWidth * avatarCropState.scale}px`;
  image.style.height = `${avatarCropState.naturalHeight * avatarCropState.scale}px`;
  image.style.transform = `translate(-50%, -50%) translate(${avatarCropState.x}px, ${avatarCropState.y}px)`;
}

function clampAvatarCropOffset() {
  const displayWidth = avatarCropState.naturalWidth * avatarCropState.scale;
  const displayHeight = avatarCropState.naturalHeight * avatarCropState.scale;
  const limitX = Math.max(0, (displayWidth - avatarCropState.cropSize) / 2);
  const limitY = Math.max(0, (displayHeight - avatarCropState.cropSize) / 2);

  avatarCropState.x = clampValue(avatarCropState.x, -limitX, limitX);
  avatarCropState.y = clampValue(avatarCropState.y, -limitY, limitY);
}

function setAvatarCropScale(nextScale) {
  if (!avatarCropState.isReady) return;

  avatarCropState.scale = clampValue(
    nextScale,
    avatarCropState.minScale,
    avatarCropState.maxScale,
  );
  clampAvatarCropOffset();
  renderAvatarCropImage();
}

function getAvatarCropPointerPair() {
  return Array.from(avatarCropPointers.values()).slice(0, 2);
}

function getAvatarCropPointerCenter(first, second, stage) {
  const bounds = stage.getBoundingClientRect();
  return {
    x: (first.clientX + second.clientX) / 2 - bounds.left - bounds.width / 2,
    y: (first.clientY + second.clientY) / 2 - bounds.top - bounds.height / 2,
  };
}

function beginAvatarCropPinch(stage) {
  const [first, second] = getAvatarCropPointerPair();
  if (!first || !second) return;

  const center = getAvatarCropPointerCenter(first, second, stage);
  avatarCropState.isDragging = false;
  avatarCropState.pointerId = null;
  avatarCropState.pinchStartDistance = Math.hypot(
    second.clientX - first.clientX,
    second.clientY - first.clientY,
  );
  avatarCropState.pinchStartScale = avatarCropState.scale;
  avatarCropState.pinchStartCenterX = center.x;
  avatarCropState.pinchStartCenterY = center.y;
  avatarCropState.pinchStartX = avatarCropState.x;
  avatarCropState.pinchStartY = avatarCropState.y;
}

function startAvatarCropDrag(event) {
  if (!avatarCropState.isReady) return;

  event.preventDefault();
  avatarCropPointers.set(event.pointerId, {
    clientX: event.clientX,
    clientY: event.clientY,
  });
  event.currentTarget.setPointerCapture(event.pointerId);

  if (avatarCropPointers.size >= 2) {
    beginAvatarCropPinch(event.currentTarget);
    return;
  }

  avatarCropState.isDragging = true;
  avatarCropState.pointerId = event.pointerId;
  avatarCropState.startClientX = event.clientX;
  avatarCropState.startClientY = event.clientY;
  avatarCropState.startX = avatarCropState.x;
  avatarCropState.startY = avatarCropState.y;
}

function moveAvatarCropDrag(event) {
  if (!avatarCropPointers.has(event.pointerId)) return;

  event.preventDefault();
  avatarCropPointers.set(event.pointerId, {
    clientX: event.clientX,
    clientY: event.clientY,
  });

  if (avatarCropPointers.size >= 2) {
    const [first, second] = getAvatarCropPointerPair();
    const startDistance = avatarCropState.pinchStartDistance;
    if (!first || !second || !startDistance) return;

    const distance = Math.hypot(
      second.clientX - first.clientX,
      second.clientY - first.clientY,
    );
    const center = getAvatarCropPointerCenter(
      first,
      second,
      event.currentTarget,
    );
    const nextScale = clampValue(
      avatarCropState.pinchStartScale * (distance / startDistance),
      avatarCropState.minScale,
      avatarCropState.maxScale,
    );
    const sourceX =
      (avatarCropState.pinchStartCenterX - avatarCropState.pinchStartX) /
      avatarCropState.pinchStartScale;
    const sourceY =
      (avatarCropState.pinchStartCenterY - avatarCropState.pinchStartY) /
      avatarCropState.pinchStartScale;
    avatarCropState.scale = nextScale;
    avatarCropState.x = center.x - sourceX * nextScale;
    avatarCropState.y = center.y - sourceY * nextScale;
    clampAvatarCropOffset();
    renderAvatarCropImage();
    const { zoom } = getAvatarCropElements();
    if (zoom) zoom.value = avatarCropState.scale;
    return;
  }

  if (
    !avatarCropState.isDragging ||
    avatarCropState.pointerId !== event.pointerId
  )
    return;
  avatarCropState.x =
    avatarCropState.startX + event.clientX - avatarCropState.startClientX;
  avatarCropState.y =
    avatarCropState.startY + event.clientY - avatarCropState.startClientY;
  clampAvatarCropOffset();
  renderAvatarCropImage();
}

function endAvatarCropDrag(event) {
  if (!avatarCropPointers.has(event.pointerId)) return;

  avatarCropPointers.delete(event.pointerId);
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  avatarCropState.pinchStartDistance = 0;
  if (avatarCropPointers.size >= 2) {
    beginAvatarCropPinch(event.currentTarget);
    return;
  }

  const remainingPointer = avatarCropPointers.entries().next().value;
  if (remainingPointer) {
    const [pointerId, point] = remainingPointer;
    avatarCropState.isDragging = true;
    avatarCropState.pointerId = pointerId;
    avatarCropState.startClientX = point.clientX;
    avatarCropState.startClientY = point.clientY;
    avatarCropState.startX = avatarCropState.x;
    avatarCropState.startY = avatarCropState.y;
    return;
  }

  avatarCropState.isDragging = false;
  avatarCropState.pointerId = null;
}

function handleAvatarCropWheel(event) {
  if (!avatarCropState.isReady) return;

  event.preventDefault();
  const zoomFactor = event.deltaY < 0 ? 1.06 : 0.94;
  const nextScale = avatarCropState.scale * zoomFactor;
  const { zoom } = getAvatarCropElements();
  setAvatarCropScale(nextScale);
  if (zoom) zoom.value = avatarCropState.scale;
}

function getAvatarCropSourceRect() {
  const displayWidth = avatarCropState.naturalWidth * avatarCropState.scale;
  const displayHeight = avatarCropState.naturalHeight * avatarCropState.scale;
  const sourceWidth = Math.min(
    avatarCropState.naturalWidth,
    avatarCropState.cropSize / avatarCropState.scale,
  );
  const sourceHeight = Math.min(
    avatarCropState.naturalHeight,
    avatarCropState.cropSize / avatarCropState.scale,
  );
  const sourceX = clampValue(
    (displayWidth / 2 - avatarCropState.x - avatarCropState.cropSize / 2) /
      avatarCropState.scale,
    0,
    avatarCropState.naturalWidth - sourceWidth,
  );
  const sourceY = clampValue(
    (displayHeight / 2 - avatarCropState.y - avatarCropState.cropSize / 2) /
      avatarCropState.scale,
    0,
    avatarCropState.naturalHeight - sourceHeight,
  );

  return { sourceX, sourceY, sourceWidth, sourceHeight };
}

function getAvatarCropOutputType(fileType) {
  if (fileType === "image/jpeg") return "image/jpeg";
  if (fileType === "image/webp") return "image/webp";
  return "image/png";
}

function getAvatarCropFileExtension(fileType) {
  if (fileType === "image/jpeg") return "jpg";
  if (fileType === "image/webp") return "webp";
  return "png";
}

function canvasToBlob(canvas, fileType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, fileType, quality);
  });
}

async function applyAvatarCrop() {
  const { image } = getAvatarCropElements();
  if (!image || !avatarCropState.isReady || !avatarCropOriginalFile) return;

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_CROP_OUTPUT_SIZE;
  canvas.height = AVATAR_CROP_OUTPUT_SIZE;
  const context = canvas.getContext("2d");
  const { sourceX, sourceY, sourceWidth, sourceHeight } =
    getAvatarCropSourceRect();

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    AVATAR_CROP_OUTPUT_SIZE,
    AVATAR_CROP_OUTPUT_SIZE,
  );

  let outputType = getAvatarCropOutputType(avatarCropOriginalFile.type);
  let blob = await canvasToBlob(canvas, outputType, 0.92);
  if (!blob && outputType !== "image/png") {
    outputType = "image/png";
    blob = await canvasToBlob(canvas, outputType, 0.92);
  }

  if (!blob) {
    alert("프로필 사진을 만들지 못했습니다. 다른 사진을 선택해주세요.");
    return;
  }

  if (editAvatarPreviewObjectUrl) {
    URL.revokeObjectURL(editAvatarPreviewObjectUrl);
  }

  const extension = getAvatarCropFileExtension(outputType);
  selectedProfileAvatarFile = new File(
    [blob],
    `avatar-crop-${Date.now()}.${extension}`,
    { type: outputType },
  );
  shouldRemoveProfileAvatar = false;
  editAvatarPreviewObjectUrl = URL.createObjectURL(selectedProfileAvatarFile);
  setEditProfileAvatarPreview(editAvatarPreviewObjectUrl);
  closeAvatarCropper(true);
}

function resetEditProfileAvatarState() {
  closeAvatarCropper(false);
  selectedProfileAvatarFile = null;
  shouldRemoveProfileAvatar = false;
  if (editAvatarPreviewObjectUrl) {
    URL.revokeObjectURL(editAvatarPreviewObjectUrl);
    editAvatarPreviewObjectUrl = null;
  }
  const input = document.getElementById("editAvatarInput");
  if (input) input.value = "";
}

function handleProfileAvatarChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    alert("프로필 사진은 JPG, PNG, WebP, GIF 파일만 업로드할 수 있습니다.");
    event.target.value = "";
    return;
  }

  if (file.size > MAX_AVATAR_SOURCE_SIZE) {
    alert("프로필 사진은 15MB 이하 이미지를 선택해주세요.");
    event.target.value = "";
    return;
  }

  openAvatarCropper(file);
}

function removeProfileAvatar() {
  resetEditProfileAvatarState();
  shouldRemoveProfileAvatar = true;
  setEditProfileAvatarPreview(DEFAULT_PROFILE_AVATAR_URL);
}

async function uploadProfileAvatar(file) {
  const rawExtension = file.name.split(".").pop() || "jpg";
  const extension =
    rawExtension.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const filePath = `${currentUser.id}/avatar-${Date.now()}.${extension}`;
  const { error } = await client.storage
    .from("avatars")
    .upload(filePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (error) throw error;

  const { data } = client.storage.from("avatars").getPublicUrl(filePath);
  return data.publicUrl;
}

function getProfileAvatarUploadErrorMessage(error) {
  const message = error?.message || "";

  if (message.toLowerCase().includes("bucket not found")) {
    return [
      "프로필 사진 업로드에 실패했습니다.",
      "avatars 스토리지 버킷이 없습니다.",
      "Supabase SQL Editor에서 supabase-avatar-storage-setup.sql을 실행해주세요.",
    ].join("\n");
  }

  return `프로필 사진 업로드에 실패했습니다.${message ? `\n${message}` : "\navatars 스토리지 설정을 확인해주세요."}`;
}

function handleNavTap(tabName) {
  const now = Date.now();
  const activeView = document.querySelector(".app-view.active");
  const isCurrentTab = activeView?.id === `view-${tabName}`;
  const isDoubleTap =
    isCurrentTab && lastNavTapTab === tabName && now - lastNavTapTime < 450;

  if (isDoubleTap) {
    lastNavTapTab = null;
    lastNavTapTime = 0;
    refreshTab(tabName);
    return;
  }

  if (isCurrentTab) {
    activeView.scrollTo({ top: 0, behavior: "smooth" });
  } else {
    switchTab(tabName);
  }

  lastNavTapTab = tabName;
  lastNavTapTime = now;
}

function updateViewedProfileFollowButton() {
  const button = document.getElementById("viewedProfileFollowButton");
  button.disabled = false;
  button.classList.toggle("following", viewedProfileIsFollowing);
  button.innerText = viewedProfileIsFollowing ? "팔로잉" : "팔로우";
}

function createPostGridItem(post, index, contextKey) {
  const item = document.createElement("div");
  item.className = "grid-item";
  item.addEventListener("click", () => openContextPostFeed(contextKey, index));

  const text = document.createElement("div");
  text.className = "grid-text";
  text.textContent = String(post?.content ?? "");
  item.appendChild(text);
  return item;
}

async function loadViewedProfileStats() {
  if (!viewedProfileUserId) return;
  contextPostCollections.set("viewed-profile", []);

  const [counts, postsResult] = await Promise.all([
    getFollowCounts(viewedProfileUserId),
    runVisibleContentQuery(
      () =>
        client
          .from("posts")
          .select("*")
          .eq("user_id", viewedProfileUserId)
          .order("created_at", { ascending: false }),
      "viewed-profile-posts-load",
    ),
  ]);

  document.getElementById("viewedProfilePosts").innerText =
    postsResult.data?.length || 0;
  document.getElementById("viewedProfileFollowers").innerText =
    counts.followers;
  document.getElementById("viewedProfileFollowing").innerText =
    counts.following;

  const grid = document.getElementById("viewedProfileGrid");
  if (postsResult.error) {
    grid.innerHTML =
      '<div class="profile-list-empty">게시글을 불러오지 못했습니다.</div>';
    return;
  }
  if (!postsResult.data.length) {
    grid.innerHTML =
      '<div class="profile-list-empty">작성한 글이 없습니다.</div>';
    return;
  }

  contextPostCollections.set("viewed-profile", postsResult.data);
  grid.replaceChildren(
    ...postsResult.data.map((post, index) =>
      createPostGridItem(post, index, "viewed-profile"),
    ),
  );
}

async function openUserProfile(userId) {
  if (currentUser?.id === userId) {
    closeSheet("followListSheet");
    switchTab("profile");
    return;
  }
  if (blockedUserIds.has(userId)) {
    showAppAlert(
      "차단한 사용자입니다.\n설정의 차단한 사용자 관리에서 해제할 수 있습니다.",
    );
    return;
  }

  const activeView = document.querySelector(".app-view.active");
  if (activeView?.id !== "view-user-profile") {
    userProfileReturnViewId = activeView?.id || "view-home";
  }

  viewedProfileUserId = userId;
  viewedProfileIsFollowing = false;
  closeSheet("followListSheet");
  activateAppView("view-user-profile");

  const name = document.getElementById("viewedProfileName");
  const id = document.getElementById("viewedProfileId");
  const button = document.getElementById("viewedProfileFollowButton");
  document.getElementById("viewedProfileGrid").innerHTML =
    '<div class="profile-list-empty">게시글을 불러오는 중...</div>';
  name.innerText = "불러오는 중...";
  id.innerText = "";
  renderProfileBio("viewedProfileBio", "");
  applyViewedProfileTheme("default");
  button.disabled = true;

  let { data: profile, error } = await client
    .from("profiles")
    .select("id, nickname, custom_id, avatar_url, bio, theme")
    .eq("id", userId)
    .single();

  if (isMissingProfileAppearanceColumnError(error)) {
    reportClientDiagnostic("viewed-profile-appearance-columns-missing", error);
    ({ data: profile, error } = await client
      .from("profiles")
      .select("id, nickname, custom_id, avatar_url")
      .eq("id", userId)
      .single());
  }

  if (error || !profile) {
    closeUserProfile();
    alert("사용자 프로필을 불러오지 못했습니다.");
    return;
  }

  name.innerText = profile.nickname;
  id.innerText = `@${profile.custom_id || profile.nickname}`;
  renderProfileBio("viewedProfileBio", profile.bio);
  applyViewedProfileTheme(profile.theme);
  button.dataset.nickname = profile.nickname;
  contextPostTitles.set("viewed-profile", `${profile.nickname}님의 게시물`);
  setViewedProfileAvatar(profile.avatar_url);

  if (currentUser) {
    const { data: follow } = await client
      .from("follows")
      .select("follower_id")
      .eq("follower_id", currentUser.id)
      .eq("following_id", userId)
      .maybeSingle();
    viewedProfileIsFollowing = Boolean(follow);
  }

  updateViewedProfileFollowButton();
  await loadViewedProfileStats();
}

function closeUserProfile() {
  applyViewedProfileTheme("default");
  activateAppView(userProfileReturnViewId);
}

async function toggleFollow() {
  if (!currentUser) {
    alert("팔로우하려면 로그인이 필요합니다.");
    return;
  }
  if (!viewedProfileUserId || viewedProfileUserId === currentUser.id) return;
  if (blockedUserIds.has(viewedProfileUserId)) {
    showAppAlert("차단한 사용자는 팔로우할 수 없습니다.");
    return;
  }

  const button = document.getElementById("viewedProfileFollowButton");
  button.disabled = true;

  let error;
  if (viewedProfileIsFollowing) {
    ({ error } = await client
      .from("follows")
      .delete()
      .eq("follower_id", currentUser.id)
      .eq("following_id", viewedProfileUserId));
  } else {
    ({ error } = await client.from("follows").insert([
      {
        follower_id: currentUser.id,
        following_id: viewedProfileUserId,
      },
    ]));
  }

  if (error) {
    button.disabled = false;
    alert("팔로우 처리 중 오류가 발생했습니다.");
    return;
  }

  const startedFollowing = !viewedProfileIsFollowing;
  viewedProfileIsFollowing = startedFollowing;
  updateViewedProfileFollowButton();
  await Promise.all([loadViewedProfileStats(), loadMyFollowStats()]);

  if (startedFollowing) {
    const myNickname =
      currentUser.user_metadata?.random_nickname ||
      currentUser.email.split("@")[0];
    const { error: notificationError } = await client
      .from("notifications")
      .insert([
         {
           target_user: button.dataset.nickname,
           target_user_id: viewedProfileUserId,
           actor_nickname: myNickname,
           actor_user_id: currentUser.id,
           type: "follow",
         },
      ]);
    if (notificationError) {
      reportClientDiagnostic("follow-notification-save", notificationError);
    }
    void sendPushNotification(viewedProfileUserId, "follows");
  }
}

function createFollowListRow(profile) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "follow-list-row";
  row.addEventListener("click", () => openUserProfile(profile.id));

  const avatar = document.createElement("span");
  avatar.className = "follow-list-avatar";
  renderAvatarElement(avatar, profile.avatar_url, "1.6rem");

  const text = document.createElement("span");
  text.className = "follow-list-profile";
  const nickname = document.createElement("strong");
  nickname.innerText = profile.nickname;
  const customId = document.createElement("small");
  customId.innerText = `@${profile.custom_id || profile.nickname}`;
  text.append(nickname, customId);

  const chevron = document.createElement("span");
  chevron.className = "material-symbols-outlined follow-list-chevron";
  chevron.innerText = "chevron_right";
  row.append(avatar, text, chevron);
  return row;
}

function openMyFollowList(type) {
  if (currentUser) openFollowList(currentUser.id, type);
}

function openViewedFollowList(type) {
  if (viewedProfileUserId) openFollowList(viewedProfileUserId, type);
}

async function openFollowList(userId, type) {
  if (!userId) return;

  const isFollowers = type === "followers";
  const title = isFollowers ? "팔로워" : "팔로잉";
  const idColumn = isFollowers ? "follower_id" : "following_id";
  const ownerColumn = isFollowers ? "following_id" : "follower_id";
  const list = document.getElementById("followList");

  document.getElementById("followListTitle").innerText = title;
  list.innerHTML = `<div class="profile-list-empty">${title} 목록을 불러오는 중...</div>`;
  openSheet("followListSheet");

  const { data: relations, error: relationError } = await client
    .from("follows")
    .select(`${idColumn}, created_at`)
    .eq(ownerColumn, userId)
    .order("created_at", { ascending: false });

  if (relationError) {
    list.innerHTML =
      '<div class="profile-list-empty">목록을 불러오지 못했습니다.</div>';
    return;
  }

  const userIds = relations
    .map((relation) => relation[idColumn])
    .filter((profileId) => !blockedUserIds.has(profileId));
  if (!userIds.length) {
    list.innerHTML = `<div class="profile-list-empty">아직 ${title} 사용자가 없습니다.</div>`;
    return;
  }

  const { data: profiles, error: profileError } = await client
    .from("profiles")
    .select("id, nickname, custom_id, avatar_url")
    .in("id", userIds);

  if (profileError) {
    list.innerHTML =
      '<div class="profile-list-empty">사용자 정보를 불러오지 못했습니다.</div>';
    return;
  }

  const profilesById = new Map(
    profiles.map((profile) => [profile.id, profile]),
  );
  list.replaceChildren();
  userIds.forEach((id) => {
    const profile = profilesById.get(id);
    if (profile) list.appendChild(createFollowListRow(profile));
  });
}

function updateAuthUI() {
  const authContainer = document.getElementById("authContainer");
  const profileContainer = document.getElementById("profileContainer");
  const adminCenterMenu = document.getElementById("adminCenterMenu");
  adminCenterMenu.style.display = currentUserIsModerator ? "flex" : "none";
  updateSettingsAccessVisibility();

  if (currentUser) {
    authContainer.style.display = "none";
    profileContainer.style.display = "block";

    const displayName = getCurrentAuthorNickname();
    const displayId = getCurrentAuthorCustomId();
    const avatarUrl = getCurrentAvatarUrl();

    document.getElementById("profileName").innerText = displayName;
    document.getElementById("profileId").innerText = `@${displayId}`;
    renderProfileBio("profileBio", currentProfileBio);
    applyOwnProfileTheme(currentProfileTheme);
    setOwnProfileAvatar(avatarUrl);

    runVisibleContentQuery(
      () =>
        client
          .from("posts")
          .select("id", { count: "exact" })
          .eq("user_id", currentUser.id),
      "profile-post-count-load",
    ).then(({ count }) => {
        document.getElementById("statPosts").innerText = count || 0;
      });
    loadMyFollowStats();
  } else {
    authContainer.style.display = "block";
    profileContainer.style.display = "none";
    renderProfileBio("profileBio", "");
    applyOwnProfileTheme("default");
  }
}

function openEditProfile() {
  if (!currentUser) return;
  const currentNick = getCurrentAuthorNickname();
  const currentId = getCurrentAuthorCustomId();

  resetEditProfileAvatarState();
  setEditProfileAvatarPreview(getCurrentAvatarUrl());
  document.getElementById("editNicknameInput").value = currentNick;
  document.getElementById("editIdInput").value = currentId;
  document.getElementById("editBioInput").value = currentProfileBio;
  setSelectedProfileTheme(currentProfileTheme);
  openSheet("editProfileSheet");
}

async function saveProfile() {
  if (!currentUser) return;
  const newNick = document.getElementById("editNicknameInput").value.trim();
  const newId = document.getElementById("editIdInput").value.trim();
  const rawBio = document.getElementById("editBioInput").value;
  const newBio = normalizeProfileBio(rawBio);
  const newTheme = "default";
  const saveButton = document.getElementById("editProfileSaveButton");

  if (!newNick || newNick.length < 2 || newNick.length > 40) {
    alert("닉네임은 2자 이상 40자 이하로 입력해주세요.");
    return;
  }
  if (newNick === "🚨글림 운영자") {
    alert("운영자 전용 닉네임은 사용할 수 없습니다.");
    return;
  }
  const validIdRegex = /^[a-zA-Z0-9_.]+$/;
  if (
    !newId ||
    newId.length < 3 ||
    newId.length > 40 ||
    !validIdRegex.test(newId)
  ) {
    alert(
      "아이디는 3자 이상 40자 이하이며, 영문/숫자/밑줄(_)/마침표(.)만 사용할 수 있습니다.",
    );
    return;
  }
  if (getProfileBioLength(rawBio) > PROFILE_BIO_MAX_LENGTH) {
    alert("소개글은 60자 이하로 입력해주세요.");
    return;
  }

  const oldNick = getCurrentAuthorNickname();
  const previousProfileState = {
    user: currentUser,
    metadata: { ...(currentUser.user_metadata || {}) },
    nickname: currentProfileNickname,
    customId: currentProfileCustomId,
    bio: currentProfileBio,
    theme: currentProfileTheme,
  };

  const avatarChanged = selectedProfileAvatarFile || shouldRemoveProfileAvatar;
  let avatarUrl = getCurrentAvatarUrl();

  saveButton.disabled = true;
  saveButton.innerText = "저장 중...";

  try {
    if (selectedProfileAvatarFile) {
      avatarUrl = await uploadProfileAvatar(selectedProfileAvatarFile);
    } else if (shouldRemoveProfileAvatar) {
      avatarUrl = DEFAULT_PROFILE_AVATAR_URL;
    }

    const userData = { random_nickname: newNick, custom_id: newId };
    if (avatarChanged) userData.avatar_url = avatarUrl;

    const { data, error } = await client.auth.updateUser({ data: userData });

    if (error) {
      alert("프로필 업데이트 중 오류가 발생했습니다.");
      return;
    }

    currentUser = data.user || currentUser;
    currentUser.user_metadata = {
      ...currentUser.user_metadata,
      random_nickname: newNick,
      custom_id: newId,
    };
    if (avatarChanged) currentUser.user_metadata.avatar_url = avatarUrl;
    currentProfileNickname = newNick;
    currentProfileCustomId = newId;
    currentProfileBio = newBio;
    currentProfileTheme = newTheme;

    await syncCurrentUserProfile({
      preserveStoredAvatar: false,
      requirePersistence: true,
    });

    if (oldNick !== newNick) {
      const { error: displayNameError } = await client.rpc(
        "sync_authored_display_name",
      );
      if (displayNameError) {
        reportClientDiagnostic("author-name-sync", displayNameError);
      }
    }

    updateAuthUI();
    closeSheet("editProfileSheet");
    resetEditProfileAvatarState();
    loadProfileGrid("my");
    fetchPosts();
    alert("프로필이 성공적으로 변경되었습니다.");
  } catch (error) {
    if (isProfilePersistenceError(error)) {
      currentUser = previousProfileState.user;
      currentUser.user_metadata = previousProfileState.metadata;
      currentProfileNickname = previousProfileState.nickname;
      currentProfileCustomId = previousProfileState.customId;
      currentProfileBio = previousProfileState.bio;
      currentProfileTheme = previousProfileState.theme;
      updateAuthUI();
      alert("프로필 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    reportClientDiagnostic("avatar-upload", error);
    alert(getProfileAvatarUploadErrorMessage(error));
  } finally {
    saveButton.disabled = false;
    saveButton.innerText = "저장하기";
  }
}

function markPendingNativeAuthAttempt(provider) {
  try {
    localStorage.setItem(
      NATIVE_AUTH_PENDING_KEY,
      JSON.stringify({ provider, startedAt: Date.now() }),
    );
  } catch (error) {
    reportClientDiagnostic("native-auth-pending-write", error);
  }
}

function clearPendingNativeAuthAttempt() {
  try {
    localStorage.removeItem(NATIVE_AUTH_PENDING_KEY);
  } catch (error) {
    reportClientDiagnostic("native-auth-pending-clear", error);
  }
}

function hasPendingNativeAuthAttempt() {
  let rawAttempt = "";
  try {
    rawAttempt = localStorage.getItem(NATIVE_AUTH_PENDING_KEY) || "";
  } catch (error) {
    reportClientDiagnostic("native-auth-pending-read", error);
    return false;
  }

  try {
    const attempt = JSON.parse(rawAttempt);
    const age = Date.now() - Number(attempt?.startedAt);
    return (
      Number.isFinite(age) &&
      age >= 0 &&
      age <= NATIVE_AUTH_PENDING_MAX_AGE_MS &&
      ["google", "kakao", "apple"].includes(attempt?.provider)
    );
  } catch (_error) {
    return false;
  }
}

function getNativeAuthCode(url) {
  try {
    return new URL(url).searchParams.get("code")?.trim() || "";
  } catch (_error) {
    return "";
  }
}

async function handleSocialLogin(provider) {
  const requiresLoginConsent =
    !hasSeenUgcPolicyLoginConsent() && !hasPendingUgcPolicyAcceptanceAfterOAuth();
  if (requiresLoginConsent) {
    if (!(await requestUgcPolicyAgreement())) return;
    markPendingUgcPolicyAcceptanceAfterOAuth();
  }

  const nativeRuntime = isNativeRuntime();
  const options = { redirectTo: getOAuthRedirectUrl() };
  if (nativeRuntime) {
    options.skipBrowserRedirect = true;
    markPendingNativeAuthAttempt(provider);
  }

  const { data, error } = await client.auth.signInWithOAuth({
    provider: provider,
    options,
  });
  if (error) {
    if (nativeRuntime) clearPendingNativeAuthAttempt();
    const providerName =
      { apple: "Apple", google: "Google", kakao: "카카오" }[provider] ||
      provider;
    showAppAlert(`${providerName} 로그인을 시작하지 못했습니다.`);
    return;
  }

  if (nativeRuntime && data?.url) {
    try {
      await openNativeAuthSession(data.url);
    } catch (openError) {
      clearPendingNativeAuthAttempt();
      reportClientDiagnostic("native-auth-browser-open", openError);
      showAppAlert("로그인 창을 열지 못했습니다. 다시 시도해주세요.");
    }
    return;
  }

  if (nativeRuntime) clearPendingNativeAuthAttempt();
}

function getCapacitorPlugin(name) {
  return window.Capacitor?.Plugins?.[name] || null;
}

function isNativeRuntime() {
  if (typeof window.Capacitor?.isNativePlatform === "function") {
    return window.Capacitor.isNativePlatform();
  }
  const platform = window.Capacitor?.getPlatform?.();
  return platform === "android" || platform === "ios";
}

function getOAuthRedirectUrl() {
  if (isNativeRuntime()) {
    return `${GLIM_PRODUCTION_ORIGIN}${AUTH_CALLBACK_PATH}`;
  }
  if (window.location.origin === GLIM_PRODUCTION_ORIGIN) {
    return `${GLIM_PRODUCTION_ORIGIN}${AUTH_CALLBACK_PATH}`;
  }
  return `${window.location.origin}/`;
}

async function openNativeAuthSession(url) {
  const browser = getCapacitorPlugin("Browser");
  if (browser?.open) {
    await browser.open({ url });
    return;
  }
  window.location.href = url;
}

function isTrustedNativeAuthUrl(url) {
  try {
    const candidate = new URL(url);
    return (
      candidate.origin === GLIM_PRODUCTION_ORIGIN &&
      candidate.pathname === AUTH_CALLBACK_PATH
    );
  } catch (_error) {
    return false;
  }
}

async function completeAuthFromUrl(url) {
  const authCode = getNativeAuthCode(url);
  if (!authCode) throw new Error("Native OAuth callback is missing its code.");
  const { error } = await client.auth.exchangeCodeForSession(authCode);
  if (error) throw error;
}

async function handleNativeAppUrl(url) {
  if (!isTrustedNativeAuthUrl(url)) {
    reportClientDiagnostic("native-deep-link-rejected");
    return;
  }

  const authCode = getNativeAuthCode(url);
  if (!authCode || !hasPendingNativeAuthAttempt()) {
    reportClientDiagnostic("native-auth-callback-without-pending-login");
    return;
  }


  try {
    await completeAuthFromUrl(url);
    clearPendingNativeAuthAttempt();
    try {
      await getCapacitorPlugin("Browser")?.close?.();
    } catch (error) {
      reportClientDiagnostic("native-auth-browser-close", error);
    }

    window.history.replaceState({}, document.title, "/");
    const {
      data: { session },
    } = await client.auth.getSession();
    currentUser = session?.user || null;
    updateAuthUI();
    await promptForUgcPolicyAcceptanceAfterSignIn();
    switchTab("profile");
  } catch (error) {
    reportClientDiagnostic("native-auth-callback", error);
    showAppAlert("로그인을 완료하지 못했습니다. 다시 시도해주세요.");
  }
}

async function setupNativeDeepLinks() {
  const app = getCapacitorPlugin("App");
  if (!app) return;

  try {
    await app.addListener?.("appUrlOpen", (event) => {
      if (event?.url) {
        handleNativeAppUrl(event.url);
      }
    });
    const launch = await app.getLaunchUrl?.();
    if (launch?.url) {
      await handleNativeAppUrl(launch.url);
    }
  } catch (error) {
    reportClientDiagnostic("native-deep-link-setup", error);
  }
}
function getThemePreference() {
  let storedPreference = null;
  try {
    storedPreference = localStorage.getItem(THEME_PREFERENCE_KEY);
  } catch (_error) {}
  const preference =
    storedPreference ||
    document.documentElement.dataset.themePreference ||
    "system";
  return ["dark", "light", "system"].includes(preference)
    ? preference
    : "system";
}

function getResolvedTheme(preference) {
  if (preference === "system") {
    return systemThemeMediaQuery.matches ? "dark" : "light";
  }
  return preference;
}

function getThemePreferenceLabel(preference) {
  const labels = {
    dark: "다크모드 사용",
    light: "다크모드 해제",
    system: "시스템 테마",
  };
  return labels[preference] || labels.system;
}

function updateThemeSettingsUI(preference = getThemePreference()) {
  const currentLabel = document.getElementById(
    "currentThemePreferenceLabel",
  );
  if (currentLabel) currentLabel.innerText = getThemePreferenceLabel(preference);

  document.querySelectorAll("[data-theme-option]").forEach((option) => {
    const isSelected = option.dataset.themeOption === preference;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-pressed", String(isSelected));
    const check = option.querySelector(".theme-choice-check");
    if (check) {
      check.innerText = isSelected
        ? "check_circle"
        : "radio_button_unchecked";
    }
  });
}

function applyThemePreference(preference, { persist = true } = {}) {
  const safePreference = ["dark", "light", "system"].includes(preference)
    ? preference
    : "system";
  if (persist) {
    try {
      localStorage.setItem(THEME_PREFERENCE_KEY, safePreference);
    } catch (_error) {}
  }

  const resolvedTheme = getResolvedTheme(safePreference);
  document.documentElement.dataset.themePreference = safePreference;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
  const themeColor = document.getElementById("themeColorMeta");
  if (themeColor) {
    themeColor.setAttribute(
      "content",
      resolvedTheme === "dark" ? "#050505" : "#f6f2ee",
    );
  }
  syncNativeStatusBarTheme(resolvedTheme);
  updateThemeSettingsUI(safePreference);
}

function setupThemePreferences() {
  applyThemePreference(getThemePreference(), { persist: false });
  const handleSystemThemeChange = () => {
    if (getThemePreference() === "system") {
      applyThemePreference("system", { persist: false });
    }
  };
  if (systemThemeMediaQuery.addEventListener) {
    systemThemeMediaQuery.addEventListener("change", handleSystemThemeChange);
  } else {
    systemThemeMediaQuery.addListener(handleSystemThemeChange);
  }
}

function setThemePreference(preference) {
  applyThemePreference(preference);
}

function normalizeNotificationPreferences(preferences) {
  const source =
    preferences && typeof preferences === "object" ? preferences : {};
  return Object.fromEntries(
    Object.entries(DEFAULT_NOTIFICATION_PREFERENCES).map(
      ([key, defaultValue]) => [
        key,
        typeof source[key] === "boolean" ? source[key] : defaultValue,
      ],
    ),
  );
}

function getNotificationPreferencesStorageKey() {
  return currentUser
    ? `${NOTIFICATION_PREFERENCES_STORAGE_PREFIX}_${currentUser.id}`
    : "";
}

function readStoredNotificationPreferences() {
  const storageKey = getNotificationPreferencesStorageKey();
  if (!storageKey) return null;

  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || "null");
    return value && typeof value === "object"
      ? normalizeNotificationPreferences(value)
      : null;
  } catch (_error) {
    return null;
  }
}

function storeNotificationPreferences(preferences) {
  const storageKey = getNotificationPreferencesStorageKey();
  if (!storageKey) return;

  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify(normalizeNotificationPreferences(preferences)),
    );
  } catch (_error) {}
}

function getNotificationPreferences() {
  const metadataPreferences =
    currentUser?.user_metadata?.notification_preferences;
  return normalizeNotificationPreferences(
    metadataPreferences || readStoredNotificationPreferences(),
  );
}

function getPushConfig() {
  return globalThis.GLIM_PUSH_CONFIG || {};
}

function isPushConfigured() {
  const config = getPushConfig();
  return Boolean(
    config.vapidKey &&
      config.firebase?.apiKey &&
      config.firebase?.projectId &&
      config.firebase?.messagingSenderId &&
      config.firebase?.appId,
  );
}

function isPushBrowserSupported() {
  return Boolean(
    window.isSecureContext &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window,
  );
}

function getNativePushNotificationsPlugin() {
  const plugin = getCapacitorPlugin("PushNotifications");
  return isNativeRuntime() && plugin?.checkPermissions && plugin?.register
    ? plugin
    : null;
}

function isNativePushSupported() {
  return Boolean(getNativePushNotificationsPlugin());
}

function isPushOnboardingSupported() {
  if (isNativePushSupported()) return true;
  return isRunningAsInstalledApp() && isPushConfigured() && isPushBrowserSupported();
}

function syncNativeStatusBarTheme(
  resolvedTheme = document.documentElement.dataset.theme,
) {
  if (window.Capacitor?.getPlatform?.() !== "android") return;
  const statusBar = getCapacitorPlugin("StatusBar");
  void statusBar?.setStyle?.({
    style: resolvedTheme === "dark" ? "DARK" : "LIGHT",
  });
}

function setupNativeAndroidViewport() {
  if (window.Capacitor?.getPlatform?.() !== "android") return;
  document.documentElement.classList.add("native-android");
  const statusBar = getCapacitorPlugin("StatusBar");
  void statusBar?.setOverlaysWebView?.({ overlay: false });
  syncNativeStatusBarTheme();
}

function isIOSDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isRunningAsInstalledApp() {
  return Boolean(
    window.matchMedia("(display-mode: standalone)").matches ||
      navigator.standalone === true,
  );
}

function getPushFidStorageKey(userId = currentUser?.id) {
  return userId ? `${PUSH_FID_STORAGE_PREFIX}_${userId}` : "";
}

function getPushOnboardingStorageKey(userId = currentUser?.id) {
  return userId ? `${PUSH_ONBOARDING_STORAGE_PREFIX}_${userId}` : "";
}

function hasSeenPushOnboarding(userId = currentUser?.id) {
  const storageKey = getPushOnboardingStorageKey(userId);
  if (!storageKey) return false;
  try {
    return localStorage.getItem(storageKey) === "true";
  } catch (_error) {
    return false;
  }
}

function markPushOnboardingSeen(userId = currentUser?.id) {
  const storageKey = getPushOnboardingStorageKey(userId);
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, "true");
  } catch (_error) {}
}

function schedulePushOnboarding(delay = 900) {
  clearTimeout(pushOnboardingTimer);
  pushOnboardingTimer = window.setTimeout(showPushOnboardingIfNeeded, delay);
}

function showPushOnboardingIfNeeded() {
  pushOnboardingTimer = null;
  if (
    !currentUser ||
    !isPushOnboardingSupported() ||
    (!isNativePushSupported() && Notification.permission === "denied") ||
    getStoredPushFid() ||
    (!isNativePushSupported() && hasSeenPushOnboarding())
  ) {
    return;
  }

  if (document.getElementById("appAlert")?.classList.contains("open")) {
    schedulePushOnboarding(1200);
    return;
  }

  showAppConfirm(
    "좋아요와 댓글, 새로운 팔로우 소식을 앱을 닫은 뒤에도 받아볼 수 있어요.",
    () => togglePushNotifications(true),
    {
      title: "알림을 받아볼까요?",
      icon: "notifications_active",
      confirmText: "알림 켜기",
    },
  );
}

function getStoredPushFid(userId = currentUser?.id) {
  const storageKey = getPushFidStorageKey(userId);
  if (!storageKey) return "";
  try {
    return localStorage.getItem(storageKey) || "";
  } catch (_error) {
    return "";
  }
}

function storePushFid(fid, userId = currentUser?.id) {
  const storageKey = getPushFidStorageKey(userId);
  if (!storageKey || !fid) return;
  try {
    localStorage.setItem(storageKey, fid);
  } catch (_error) {}
}

function removeStoredPushFid(userId = currentUser?.id) {
  const storageKey = getPushFidStorageKey(userId);
  if (!storageKey) return;
  try {
    localStorage.removeItem(storageKey);
  } catch (_error) {}
}

async function loadFirebasePushModules() {
  if (!firebasePushModulesPromise) {
    firebasePushModulesPromise = Promise.all([
      import(
        `https://www.gstatic.com/firebasejs/${FIREBASE_WEB_SDK_VERSION}/firebase-app.js`
      ),
      import(
        `https://www.gstatic.com/firebasejs/${FIREBASE_WEB_SDK_VERSION}/firebase-messaging.js`
      ),
    ]).then(([app, messaging]) => ({ app, messaging }));
  }
  return firebasePushModulesPromise;
}

async function savePushSubscription(
  fid,
  user = currentUser,
  { deliveryChannel = "web" } = {},
) {
  if (!user?.id || !fid) throw new Error("푸시 구독 정보가 없습니다.");
  const preferences = normalizeNotificationPreferences(
    user.user_metadata?.notification_preferences ||
      readStoredNotificationPreferences(),
  );
  const { error } = await client.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      delivery_channel: deliveryChannel,
      firebase_installation_id: fid,
      preferences,
      enabled: true,
      user_agent: navigator.userAgent.slice(0, 500),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "firebase_installation_id" },
  );
  if (error) throw error;
  storePushFid(fid, user.id);

  if (deliveryChannel === "native") {
    const { error: cleanupError } = await client
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("delivery_channel", "web")
      .ilike("user_agent", "%Android%");
    if (cleanupError) {
      reportClientDiagnostic(
        "native-push-browser-subscription-cleanup",
        cleanupError,
      );
    }
  }
}

async function removePushSubscription(fid, userId = currentUser?.id) {
  if (fid && userId) {
    const { error } = await client
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("firebase_installation_id", fid);
    if (error) reportClientDiagnostic("push-subscription-delete", error);
  }
  removeStoredPushFid(userId);
}

function settlePendingPushRegistration(method, value) {
  if (!pendingPushRegistration) return;
  clearTimeout(pendingPushRegistration.timeoutId);
  const callback = pendingPushRegistration[method];
  pendingPushRegistration = null;
  callback(value);
}

function waitForPushRegistration() {
  if (pendingPushRegistration) {
    settlePendingPushRegistration(
      "reject",
      new Error("새로운 푸시 등록을 시작합니다."),
    );
  }
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (!pendingPushRegistration) return;
      pendingPushRegistration = null;
      reject(new Error("푸시 기기 등록 시간이 초과되었습니다."));
    }, 15000);
    pendingPushRegistration = { resolve, reject, timeoutId };
  });
}

function setupPushEventListeners(modules) {
  if (pushEventListenersReady || !pushMessaging) return;
  pushEventListenersReady = true;

  modules.messaging.onRegistered(pushMessaging, async (fid) => {
    const user = currentUser;
    try {
      if (!user) throw new Error("로그인이 필요합니다.");
      await savePushSubscription(fid, user);
      settlePendingPushRegistration("resolve", fid);
      updatePushNotificationSettingsUI();
    } catch (error) {
      settlePendingPushRegistration("reject", error);
      reportClientDiagnostic("push-device-save", error);
      updatePushNotificationSettingsUI();
    }
  });

  modules.messaging.onUnregistered(pushMessaging, async (fid) => {
    const userId = currentUser?.id;
    await removePushSubscription(fid, userId);
    updatePushNotificationSettingsUI();
  });

  modules.messaging.onMessage(pushMessaging, (payload) => {
    const data = payload?.data || {};
    showAppAlert(
      data.body ||
        payload?.notification?.body ||
        "글림에 새로운 소식이 도착했습니다.",
      data.postId
        ? () => openNotificationPost(data.postId, data.category)
        : undefined,
    );
    if (document.getElementById("view-noti")?.classList.contains("active")) {
      fetchNotifications();
    }
  });
}

async function getPushMessagingContext() {
  if (!isPushConfigured()) {
    throw new Error("Firebase 푸시 설정이 아직 입력되지 않았습니다.");
  }
  if (!isPushBrowserSupported()) {
    throw new Error("이 브라우저에서는 푸시 알림을 사용할 수 없습니다.");
  }

  const modules = await loadFirebasePushModules();
  if (!(await modules.messaging.isSupported())) {
    throw new Error("이 브라우저에서는 푸시 알림을 사용할 수 없습니다.");
  }

  if (!pushServiceWorkerRegistration) {
    pushServiceWorkerRegistration = await navigator.serviceWorker.register(
      "./firebase-messaging-sw.js?v=2",
      {
        scope: "./",
        updateViaCache: "none",
      },
    );
  }
  if (!pushMessaging) {
    const existingApp = modules.app
      .getApps()
      .find((app) => app.name === "[DEFAULT]");
    const firebaseApp =
      existingApp || modules.app.initializeApp(getPushConfig().firebase);
    pushMessaging = modules.messaging.getMessaging(firebaseApp);
  }
  setupPushEventListeners(modules);
  return { modules, messaging: pushMessaging };
}

function setPushNotificationSettingsState({ toggle, status, help, isEnabled, statusText, helpText, helpState = "", disabled = false }) {
  toggle.checked = isEnabled;
  toggle.disabled = disabled;
  status.innerText = statusText;
  help.innerText = helpText;
  help.dataset.state = helpState;
}

async function refreshCurrentDevicePushStatusFromServer(userId = currentUser?.id) {
  if (!userId || Notification.permission !== "granted") return;
  const checkId = ++pushRemoteStatusCheckId;
  try {
    const deliveryChannel = isNativePushSupported() ? "native" : "web";
    const subscriptionQuery = client
      .from("push_subscriptions")
      .select("firebase_installation_id, enabled, updated_at")
      .eq("user_id", userId)
      .eq("enabled", true)
      .eq("delivery_channel", deliveryChannel)
      .order("updated_at", { ascending: false })
      .limit(1);
    const { data, error } = await subscriptionQuery;
    if (checkId !== pushRemoteStatusCheckId || currentUser?.id !== userId) return;
    if (error) {
      reportClientDiagnostic("push-subscription-status-load", error);
      return;
    }
    const activeSubscription = Array.isArray(data) ? data[0] : data;
    const fid = activeSubscription?.firebase_installation_id;
    if (fid) {
      storePushFid(fid, userId);
      updatePushNotificationSettingsUI({ verifyRemote: false });
    }
  } catch (error) {
    if (checkId === pushRemoteStatusCheckId) {
      reportClientDiagnostic("push-subscription-status-load", error);
    }
  }
}

function updatePushNotificationSettingsUI({ verifyRemote = true } = {}) {
  const toggle = document.getElementById("pushNotificationToggle");
  const status = document.getElementById("pushNotificationStatus");
  const help = document.getElementById("pushNotificationHelp");
  if (!toggle || !status || !help) return;

  help.dataset.state = "";
  toggle.checked = false;
  toggle.disabled = true;

  if (!currentUser) {
    status.innerText = "로그인 후 사용할 수 있습니다.";
    return;
  }
  const nativePushSupported = isNativePushSupported();
  if (!nativePushSupported && !isPushConfigured()) {
    status.innerText = "Firebase 연결이 필요합니다.";
    help.innerText = "설정 파일에 Firebase 정보와 Web Push 키를 입력해주세요.";
    help.dataset.state = "warning";
    return;
  }
  if (isIOSDevice() && !isRunningAsInstalledApp()) {
    status.innerText = "홈 화면에 추가한 앱에서 사용 가능";
    help.innerText =
      "Safari 공유 버튼에서 ‘홈 화면에 추가’한 뒤 글림 앱을 열어주세요.";
    help.dataset.state = "warning";
    return;
  }
  if (!nativePushSupported && !isPushBrowserSupported()) {
    status.innerText = "이 브라우저에서는 지원하지 않습니다.";
    help.innerText = "HTTPS 주소 또는 설치된 글림 앱에서 다시 확인해주세요.";
    help.dataset.state = "warning";
    return;
  }
  if (!nativePushSupported && Notification.permission === "denied") {
    status.innerText = "브라우저에서 알림이 차단됨";
    help.innerText = "브라우저나 휴대폰 설정에서 글림 알림을 허용해주세요.";
    help.dataset.state = "warning";
    return;
  }

  const hasStoredFid = Boolean(getStoredPushFid());
  const notificationPermission = nativePushSupported
    ? (hasStoredFid ? "granted" : "default")
    : Notification.permission;
  const isEnabled = notificationPermission === "granted" && hasStoredFid;
  if (!nativePushSupported && !isEnabled && notificationPermission === "granted" && verifyRemote) {
    setPushNotificationSettingsState({
      toggle,
      status,
      help,
      isEnabled: false,
      disabled: true,
      statusText: "허용됨 · 기기 등록 확인 중...",
      helpText: "이 기기의 실제 푸시 등록 상태를 확인하고 있어요.",
    });
    void refreshCurrentDevicePushStatusFromServer();
    return;
  }

  setPushNotificationSettingsState({
    toggle,
    status,
    help,
    isEnabled,
    statusText: isEnabled
      ? "켜짐 · 앱을 닫아도 알림을 받아요."
      : notificationPermission === "default"
        ? "꺼짐 · 스위치를 눌러 허용"
        : "꺼짐 · 기기 등록이 필요합니다.",
    helpText: isEnabled
      ? "이 기기에만 적용됩니다."
      : "앱을 닫아도 새 소식을 받을 수 있습니다.",
    helpState: isEnabled ? "ready" : "",
  });
}

async function setupNativePushEventListeners(pushPlugin) {
  if (pushEventListenersReady) return;
  pushEventListenersReady = true;
  await pushPlugin.addListener("registration", async (token) => {
    try {
      await savePushSubscription(token.value, currentUser, {
        deliveryChannel: "native",
      });
      settlePendingPushRegistration("resolve", token.value);
    } catch (error) {
      settlePendingPushRegistration("reject", error);
      reportClientDiagnostic("native-push-device-save", error);
    } finally {
      updatePushNotificationSettingsUI();
    }
  });
  await pushPlugin.addListener("registrationError", (error) => {
    settlePendingPushRegistration("reject", new Error(error.error || "푸시 기기 등록에 실패했습니다."));
    updatePushNotificationSettingsUI();
  });
  await pushPlugin.addListener("pushNotificationReceived", (notification) => {
    showAppAlert(notification.body || "글림에 새로운 소식이 도착했습니다.");
  });
}

async function enableNativePushNotifications() {
  const pushPlugin = getNativePushNotificationsPlugin();
  if (!pushPlugin) throw new Error("이 앱에서는 네이티브 푸시를 사용할 수 없습니다.");
  let permission = await pushPlugin.checkPermissions();
  if (permission.receive === "prompt") {
    permission = await pushPlugin.requestPermissions();
  }
  if (permission.receive !== "granted") {
    throw new Error("휴대폰 설정에서 글림 알림을 허용해주세요.");
  }
  await setupNativePushEventListeners(pushPlugin);
  const registrationPromise = waitForPushRegistration();
  try {
    await pushPlugin.register();
    await registrationPromise;
  } catch (error) {
    settlePendingPushRegistration("reject", error);
    throw error;
  }
}

async function togglePushNotifications(isEnabled) {
  const toggle = document.getElementById("pushNotificationToggle");
  if (!currentUser || !toggle) return;
  toggle.disabled = true;

  try {
    if (!isEnabled) {
      await disablePushNotifications();
      showAppAlert("이 기기의 푸시 알림을 껐습니다.");
      return;
    }

    if (isNativePushSupported()) {
      await enableNativePushNotifications();
      markPushOnboardingSeen();
      return;
    }

    if (!isPushConfigured()) {
      throw new Error("Firebase 푸시 설정이 아직 입력되지 않았습니다.");
    }
    if (isIOSDevice() && !isRunningAsInstalledApp()) {
      throw new Error(
        "아이폰에서는 Safari의 ‘홈 화면에 추가’로 설치한 글림 앱에서 켤 수 있습니다.",
      );
    }
    if (!isPushBrowserSupported()) {
      throw new Error("이 브라우저에서는 푸시 알림을 사용할 수 없습니다.");
    }

    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") {
      throw new Error(
        "알림이 허용되지 않았습니다. 브라우저 설정에서 글림 알림을 허용해주세요.",
      );
    }

    const { modules, messaging } = await getPushMessagingContext();
    const registrationPromise = waitForPushRegistration();
    void registrationPromise.catch(() => {});
    try {
      await modules.messaging.register(messaging, {
        vapidKey: getPushConfig().vapidKey,
        serviceWorkerRegistration: pushServiceWorkerRegistration,
      });
    } catch (error) {
      settlePendingPushRegistration("reject", error);
      await registrationPromise.catch(() => {});
      throw error;
    }
    await registrationPromise;
    markPushOnboardingSeen();
  } catch (error) {
    reportClientDiagnostic("push-preference-save", error);
    showAppAlert(
      error instanceof Error
        ? error.message
        : "푸시 알림을 설정하지 못했습니다.",
    );
  } finally {
    updatePushNotificationSettingsUI();
  }
}

async function disablePushNotifications({ silent = false } = {}) {
  const fid = getStoredPushFid();
  const userId = currentUser?.id;
  await removePushSubscription(fid, userId);

  const nativePushPlugin = getNativePushNotificationsPlugin();
  if (nativePushPlugin) {
    await nativePushPlugin.unregister();
  } else if (pushMessaging && isPushConfigured()) {
    try {
      const modules = await loadFirebasePushModules();
      await modules.messaging.unregister(pushMessaging);
    } catch (error) {
      if (!silent) reportClientDiagnostic("push-device-unregister", error);
    }
  }
  updatePushNotificationSettingsUI();
}

async function initializePushNotifications() {
  updatePushNotificationSettingsUI();
  const nativePushPlugin = getNativePushNotificationsPlugin();
  if (nativePushPlugin) {
    if (!currentUser || !getStoredPushFid()) return;
    const permission = await nativePushPlugin.checkPermissions();
    if (permission.receive !== "granted") return;
    await setupNativePushEventListeners(nativePushPlugin);
    await nativePushPlugin.register();
    return;
  }
  if (
    !currentUser ||
    !isPushConfigured() ||
    !isPushBrowserSupported() ||
    Notification.permission !== "granted" ||
    !getStoredPushFid() ||
    (isIOSDevice() && !isRunningAsInstalledApp())
  ) {
    return;
  }

  const { modules, messaging } = await getPushMessagingContext();
  await modules.messaging.register(messaging, {
    vapidKey: getPushConfig().vapidKey,
    serviceWorkerRegistration: pushServiceWorkerRegistration,
  });
}

async function syncPushNotificationPreferences(preferences) {
  if (!currentUser || !getStoredPushFid()) return;
  const { error } = await client
    .from("push_subscriptions")
    .update({
      preferences: normalizeNotificationPreferences(preferences),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", currentUser.id)
    .eq("firebase_installation_id", getStoredPushFid());
  if (error) {
    reportClientDiagnostic("push-category-sync", error);
  }
}

async function requestPostAiAnalysis(postId) {
  if (!currentUser || !postId) return;
  if (postAiAnalysisRequestIds.has(postId)) return;
  postAiAnalysisRequestIds.add(postId);
  try {
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session?.access_token) return;
    const response = await fetch(SUPABASE_URL + "/functions/v1/analyze-post", {
      method: "POST",
      mode: "cors",
      keepalive: true,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + session.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ postId }),
    });
    if (!response.ok) {
      reportClientDiagnostic("post-ai-analysis-response", { status: response.status });
    }
  } catch (error) {
    reportClientDiagnostic("post-ai-analysis", error);
  }
}

async function sendPushNotification(targetUserId, category, postId = "") {
  if (
    !currentUser ||
    !targetUserId ||
    targetUserId === currentUser.id ||
    !NOTIFICATION_PREFERENCE_KEYS.has(category)
  ) {
    return;
  }

  try {
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session?.access_token) {
      reportClientDiagnostic("push-send-no-session");
      return;
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      mode: "cors",
      keepalive: true,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ targetUserId, category, postId }),
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      reportClientDiagnostic("push-send-response", {
        code: result.error ? "edge-error" : "http-error",
        status: response.status,
      });
    }
  } catch (error) {
    reportClientDiagnostic("push-send", error);
  }
}

function renderNotificationSettingsUI() {
  const preferences = getNotificationPreferences();
  document
    .querySelectorAll("[data-notification-preference]")
    .forEach((input) => {
      const key = input.dataset.notificationPreference;
      input.checked = Boolean(preferences[key]);
    });

  const summary = document.getElementById("notificationSettingsSummary");
  const enabledCount = Object.values(preferences).filter(Boolean).length;
  if (summary) {
    summary.innerText =
      enabledCount === NOTIFICATION_PREFERENCE_KEYS.size
        ? "모든 알림 받기"
        : enabledCount === 0
          ? "모든 알림 끔"
          : `${enabledCount}개 카테고리 받기`;
  }

  if (currentUser) storeNotificationPreferences(preferences);
  updatePushNotificationSettingsUI();
}

function setNotificationPreferenceControlsDisabled(isDisabled) {
  document
    .querySelectorAll("[data-notification-preference]")
    .forEach((input) => {
      input.disabled = Boolean(isDisabled);
    });
}

async function setNotificationPreference(category, isEnabled) {
  if (!currentUser || !NOTIFICATION_PREFERENCE_KEYS.has(category)) return;
  const previousPreferences = getNotificationPreferences();
  const nextPreferences = {
    ...previousPreferences,
    [category]: Boolean(isEnabled),
  };

  currentUser.user_metadata = {
    ...currentUser.user_metadata,
    notification_preferences: nextPreferences,
  };
  storeNotificationPreferences(nextPreferences);
  renderNotificationSettingsUI();
  setNotificationPreferenceControlsDisabled(true);

  const { data, error } = await client.auth.updateUser({
    data: { notification_preferences: nextPreferences },
  });
  if (error) {
    currentUser.user_metadata = {
      ...currentUser.user_metadata,
      notification_preferences: previousPreferences,
    };
    storeNotificationPreferences(previousPreferences);
    renderNotificationSettingsUI();
    setNotificationPreferenceControlsDisabled(false);
    showAppAlert("알림 설정을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
    return;
  }

  currentUser = data.user || currentUser;
  await syncPushNotificationPreferences(nextPreferences);
  setNotificationPreferenceControlsDisabled(false);
  if (document.getElementById("view-noti")?.classList.contains("active")) {
    await fetchNotifications();
  }
}

function getNotificationPreferenceCategory(notificationType) {
  const categories = {
    like: "likes",
    comment: "comments",
    follow: "follows",
    announcement: "announcements",
    notice: "announcements",
    event: "announcements",
    admin: "announcements",
  };
  return categories[notificationType] || "announcements";
}

function isNotificationTypeEnabled(notificationType, preferences) {
  return Boolean(
    preferences[getNotificationPreferenceCategory(notificationType)],
  );
}

function updateSettingsAccessVisibility() {
  const isLoggedIn = Boolean(currentUser);
  const accountSection = document.getElementById("settingsAccountSection");
  const notificationRow = document.getElementById(
    "settingsNotificationRow",
  );

  if (accountSection) accountSection.hidden = !isLoggedIn;
  if (notificationRow) notificationRow.hidden = !isLoggedIn;
  renderNotificationSettingsUI();
}

function openSettingsView() {
  updateSettingsAccessVisibility();
  updateThemeSettingsUI();
  activateAppView("view-settings");
}

function closeSettingsView() {
  switchTab("profile");
}

function openNotificationSettingsView() {
  if (!currentUser) return;
  renderNotificationSettingsUI();
  activateAppView("view-notification-settings");
}

function closeNotificationSettingsView() {
  activateAppView("view-settings");
}

function openPrivacyPolicyView() {
  legalReturnViewId =
    document.querySelector(".app-view.active")?.id || "view-settings";
  activateAppView("view-privacy-policy");
}

function closePrivacyPolicyView() {
  activateAppView(legalReturnViewId);
}

function openTermsOfServiceView() {
  legalReturnViewId =
    document.querySelector(".app-view.active")?.id || "view-settings";
  activateAppView("view-terms-of-service");
}

function closeTermsOfServiceView() {
  activateAppView(legalReturnViewId);
}

function openSupportView() {
  legalReturnViewId =
    document.querySelector(".app-view.active")?.id || "view-settings";
  activateAppView("view-support");
}

function closeSupportView() {
  activateAppView(legalReturnViewId);
}

function openCommunityStandardsView() {
  legalReturnViewId =
    document.querySelector(".app-view.active")?.id || "view-settings";
  activateAppView("view-community-standards");
}

function closeCommunityStandardsView() {
  activateAppView(legalReturnViewId);
}

function openAccountDeleteView() {
  legalReturnViewId =
    document.querySelector(".app-view.active")?.id || "view-profile";
  activateAppView("view-account-delete");
}

function closeAccountDeleteView() {
  if (window.location.pathname === "/account-delete") {
    switchTab("home");
    return;
  }
  activateAppView(legalReturnViewId);
}

function handlePublicStaticRoute() {
  const publicView = new URLSearchParams(window.location.search).get("view");
  if (window.location.pathname === AUTH_CALLBACK_PATH) {
    window.history.replaceState({}, document.title, "/");
    switchTab(currentUser ? "profile" : "home");
  } else if (window.location.pathname === "/account-delete") {
    openAccountDeleteView();
  } else if (window.location.pathname === "/support") {
    openSupportView();
  } else if (window.location.pathname === "/privacy-policy" ||
    publicView === "privacy-policy") {
    openPrivacyPolicyView();
  } else if (window.location.pathname === "/community-standards") {
    openCommunityStandardsView();
  }
}

function setupAccountDeleteRequestForm() {
  const form = document.getElementById("accountDeleteRequestForm");
  form?.addEventListener("submit", submitAccountDeletionRequest);
}

async function submitAccountDeletionRequest(event) {
  event.preventDefault();
  const emailInput = document.getElementById("accountDeleteRequestEmail");
  const status = document.getElementById("accountDeleteRequestStatus");
  const submit = document.getElementById("accountDeleteRequestSubmit");
  const email = emailInput?.value.trim() || "";
  if (!email || !email.includes("@")) {
    if (status) status.textContent = "요청 접수를 위해 이메일을 입력해 주세요.";
    return;
  }

  submit?.setAttribute("disabled", "true");
  if (status) status.textContent = "삭제 요청을 접수하고 있습니다...";
  const receivedMessage =
    "삭제 요청을 접수했습니다. 가입 여부와 관계없이 동일하게 안내되며, 필요한 경우 본인 확인 절차가 이어집니다.";
  try {
    const { error } = await client.functions.invoke("delete-account", {
      body: { requestDeletion: true, email },
    });
    if (error) throw error;
    if (emailInput) emailInput.value = "";
    if (status) status.textContent = receivedMessage;
  } catch (error) {
    reportClientDiagnostic("account-delete-public-request", error);
    if (status) {
      status.textContent =
        "지금은 요청을 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    }
  } finally {
    submit?.removeAttribute("disabled");
  }
}

function openThemeSettingsView() {
  updateThemeSettingsUI();
  activateAppView("view-theme-settings");
}

function closeThemeSettingsView() {
  activateAppView("view-settings");
}

function getCurrentLoginProviderLabel() {
  const provider =
    currentUser?.app_metadata?.provider ||
    currentUser?.identities?.[0]?.provider ||
    "email";
  const labels = {
    kakao: "카카오 계정으로 로그인",
    google: "Google 계정으로 로그인",
    apple: "Apple 계정으로 로그인",
    email: "이메일로 로그인",
  };
  return labels[provider] || `${provider} 계정으로 로그인`;
}

function updateAccountCenterInfo() {
  const provider = document.getElementById("accountLoginProvider");
  const email = document.getElementById("accountLoginEmail");
  if (!provider || !email || !currentUser) return;

  provider.innerText = getCurrentLoginProviderLabel();
  email.innerText = currentUser.email || "연결된 이메일 정보가 없습니다.";
}

function openAccountCenterView() {
  if (!currentUser) return;
  updateAccountCenterInfo();
  activateAppView("view-account-center");
}

function closeAccountCenterView() {
  activateAppView("view-settings");
}

async function handleSignOut() {
  await disablePushNotifications({ silent: true });
  await client.auth.signOut();
  blockedUserIds.clear();
  blockedUserNicknames.clear();
  likedPostIds.clear();
  bookmarkedPostIds.clear();
  likedCommentIds.clear();
  alert("로그아웃 되었습니다.");
  switchTab("home");
}

function removeBlockedUserContent(userId) {
  contextPostCollections.forEach((posts, contextKey) => {
    contextPostCollections.set(
      contextKey,
      posts.filter((post) => post.user_id !== userId),
    );
  });

  document.querySelectorAll(".post").forEach((postElement) => {
    if (postElement.dataset.userId === String(userId)) {
      observer.unobserve(postElement);
      contextObserver.unobserve(postElement);
      postElement.remove();
    }
  });

  if (
    document.querySelector(".app-view.active")?.id === "view-context-feed" &&
    !document.querySelector("#contextPostFeed .post")
  ) {
    closeContextPostFeed();
  }
  if (
    document.querySelector(".app-view.active")?.id === "view-user-profile" &&
    viewedProfileUserId === userId
  ) {
    closeUserProfile();
  }
}

function blockUser(userId) {
  if (!currentUser) {
    showAppAlert("사용자를 차단하려면 로그인이 필요합니다.");
    return;
  }
  if (!userId || userId === currentUser.id) return;
  if (blockedUserIds.has(userId)) {
    showAppAlert("이미 차단한 사용자입니다.");
    return;
  }

  showAppConfirm(
    "이 사용자의 글과 댓글이 피드에서 보이지 않습니다.\n차단하시겠습니까?",
    () => submitUserBlock(userId),
    {
      title: "사용자 차단",
      icon: "block",
      confirmText: "차단",
      isDestructive: true,
    },
  );
}

async function submitUserBlock(userId) {
  if (!currentUser || !userId) return;

  const { error } = await client.from("blocks").insert([
    {
      blocker_id: currentUser.id,
      blocked_id: userId,
    },
  ]);
  if (error && error.code !== "23505") {
    showAppAlert("사용자를 차단하지 못했습니다. 잠시 후 다시 시도해주세요.");
    return;
  }

  blockedUserIds.add(userId);
  await loadBlockedUsersState();
  removeBlockedUserContent(userId);
  closeSheet("followListSheet");
  showAppAlert("사용자를 차단했습니다.");

  const activeViewId = document.querySelector(".app-view.active")?.id;
  const sourceViewId =
    activeViewId === "view-context-feed" ? contextFeedReturnViewId : activeViewId;
  if (sourceViewId === "view-explore") {
    await refreshExploreCurrentContent();
  } else {
    await fetchPosts();
  }
  if (sourceViewId === "view-profile") {
    await Promise.all([
      loadProfileGrid("my"),
      loadProfileGrid("bookmark"),
      loadProfileGrid("like"),
      loadMyFollowStats(),
    ]);
  }
}

function createBlockedUserRow(profile, userId) {
  const row = document.createElement("div");
  row.className = "blocked-user-row";

  const avatar = document.createElement("span");
  avatar.className = "follow-list-avatar";
  renderAvatarElement(avatar, profile?.avatar_url, "1.6rem");

  const text = document.createElement("span");
  text.className = "follow-list-profile";
  const nickname = document.createElement("strong");
  nickname.innerText = profile?.nickname || "알 수 없는 사용자";
  const customId = document.createElement("small");
  customId.innerText = profile
    ? `@${profile.custom_id || profile.nickname}`
    : "탈퇴했거나 삭제된 계정";
  text.append(nickname, customId);

  const unblockButton = document.createElement("button");
  unblockButton.type = "button";
  unblockButton.className = "blocked-user-unblock";
  unblockButton.innerText = "차단 해제";
  unblockButton.addEventListener("click", () => unblockUser(userId));

  row.append(avatar, text, unblockButton);
  return row;
}

async function loadBlockedUsersList() {
  const list = document.getElementById("blockedUsersList");
  if (!list || !currentUser) return;

  list.innerHTML =
    '<div class="profile-list-empty">차단 목록을 불러오는 중...</div>';
  await loadBlockedUsersState();
  const userIds = Array.from(blockedUserIds);
  if (!userIds.length) {
    list.innerHTML =
      '<div class="profile-list-empty">차단한 사용자가 없습니다.</div>';
    return;
  }

  const { data: profiles, error } = await client
    .from("profiles")
    .select("id, nickname, custom_id, avatar_url")
    .in("id", userIds);
  if (error) {
    list.innerHTML =
      '<div class="profile-list-empty">차단 목록을 불러오지 못했습니다.</div>';
    return;
  }

  const profilesById = new Map(
    (profiles || []).map((profile) => [profile.id, profile]),
  );
  list.replaceChildren(
    ...userIds.map((userId) =>
      createBlockedUserRow(profilesById.get(userId), userId),
    ),
  );
}

function openBlockedUsersSheet() {
  if (!currentUser) return;
  openSheet("blockedUsersSheet");
  loadBlockedUsersList();
}

async function unblockUser(userId) {
  if (!currentUser || !userId) return;

  const { error } = await client
    .from("blocks")
    .delete()
    .eq("blocker_id", currentUser.id)
    .eq("blocked_id", userId);
  if (error) {
    showAppAlert("차단을 해제하지 못했습니다. 잠시 후 다시 시도해주세요.");
    return;
  }

  await loadBlockedUsersState();
  await loadBlockedUsersList();
  showAppAlert("차단을 해제했습니다.");
  await fetchPosts();
}

function requestAccountDeletion() {
  if (!currentUser) return;

  showAppConfirm(
    "작성한 글과 댓글, 프로필 등\n모든 계정 정보가 삭제됩니다.\n\n삭제 후에는 복구할 수 없습니다.",
    performAccountDeletion,
    {
      title: "회원 탈퇴",
      icon: "person_remove",
      confirmText: "계정 삭제",
      isDestructive: true,
      requiredText: "회원탈퇴",
      verificationLabel:
        "계정을 삭제하려면 아래에 ‘회원탈퇴’를 입력해주세요.",
    },
  );
}

function clearDeletedAccountLocalData(userId) {
  const keysToRemove = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (
      key &&
      (key.includes(userId) ||
        key.startsWith("glim_") ||
        key.startsWith("liked_") ||
        key.startsWith("bookmarked_") ||
        key.startsWith("comment_liked_"))
    ) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

async function getCurrentProviderToken() {
  const {
    data: { session },
  } = await client.auth.getSession();
  return typeof session?.provider_token === "string" ? session.provider_token : "";
}

async function getFunctionErrorText(error) {
  const response = error?.context;
  if (response instanceof Response) {
    try {
      const body = await response.clone().json();
      return typeof body?.error === "string" ? body.error : "";
    } catch (parseError) {
      if (parseError instanceof SyntaxError) return "";
      throw parseError;
    }
  }
  return typeof error?.message === "string" ? error.message : "";
}

async function performAccountDeletion() {
  if (!currentUser) return;
  const deletingUserId = currentUser.id;
  showAppAlert("계정 정보를 안전하게 삭제하고 있습니다...");

  const providerToken = await getCurrentProviderToken();
  const body = providerToken
    ? { confirm: true, providerToken }
    : { confirm: true };
  const { error } = await client.functions.invoke("delete-account", { body });
  if (error) {
    const errorText = await getFunctionErrorText(error);
    if (errorText === "Recent sign-in required") {
      showAppAlert(
        "보안을 위해 다시 로그인한 뒤 회원 탈퇴를 다시 시도해 주세요.",
      );
      return;
    }
    showAppAlert(
      "회원 탈퇴를 완료하지 못했습니다.\n잠시 후 다시 시도해주세요.",
    );
    return;
  }

  clearDeletedAccountLocalData(deletingUserId);
  await client.auth.signOut({ scope: "local" });
  currentUser = null;
  blockedUserIds.clear();
  blockedUserNicknames.clear();
  likedPostIds.clear();
  bookmarkedPostIds.clear();
  likedCommentIds.clear();
  updateAuthUI();
  switchTab("home");
  showAppAlert("회원 탈퇴가 완료되었습니다.");
}

function scrollToProfileTab(index) {
  const tabScroll = document.getElementById("profileGridScroll");
  tabScroll.scrollTo({
    left: index * tabScroll.clientWidth,
    behavior: "smooth",
  });
}

function updateTabIndicator() {
  const tabScroll = document.getElementById("profileGridScroll");
  const indicator = document.getElementById("tabIndicator");
  const tabs = document.querySelectorAll(".p-tab");
  const width = tabScroll.clientWidth;
  if (width === 0) return;
  const ratio = tabScroll.scrollLeft / width;
  indicator.style.transform = `translateX(${ratio * 100}%)`;
  const activeIndex = Math.round(ratio);
  tabs.forEach((tab, i) => {
    if (i === activeIndex) tab.classList.add("active");
    else tab.classList.remove("active");
  });
}

async function loadProfileGrid(tabType) {
  const grid = document.getElementById(`profileGrid-${tabType}`);
  if (!grid) return;
  const contextKey = `profile-${tabType}`;
  const contextTitle =
    tabType === "my"
      ? "내 게시물"
      : tabType === "bookmark"
        ? "저장한 게시물"
        : "좋아요한 게시물";
  contextPostCollections.set(contextKey, []);
  contextPostTitles.set(contextKey, contextTitle);
  grid.innerHTML =
    '<div style="grid-column: 1 / -1; padding: 50px 0; text-align: center; color: #555;">불러오는 중...</div>';

  let targetIds = [];

  if (tabType === "my") {
    targetIds = [currentUser.id];
  } else if (tabType === "bookmark") {
    targetIds = Array.from(bookmarkedPostIds);
    if (targetIds.length === 0)
      return (grid.innerHTML =
        '<div style="grid-column: 1 / -1; text-align: center; color: #555; padding: 50px 0;">저장된 글이 없습니다.</div>');
  } else if (tabType === "like") {
    targetIds = Array.from(likedPostIds);
    if (targetIds.length === 0)
      return (grid.innerHTML =
        '<div style="grid-column: 1 / -1; text-align: center; color: #555; padding: 50px 0;">좋아요한 글이 없습니다.</div>');
  }

  const buildProfileGridQuery = () => {
    let query = client
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });
    if (tabType === "my") query = query.eq("user_id", currentUser.id);
    else query = query.in("id", targetIds);
    return query;
  };
  const { data, error } = await runVisibleContentQuery(
    buildProfileGridQuery,
    `profile-${tabType}-grid-load`,
  );
  if (error)
    return (grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #ff3b30;">오류</div>`);
  const visiblePosts = filterBlockedPosts(data);
  if (visiblePosts.length === 0)
    return (grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #555; padding: 50px 0;">기록이 없습니다.</div>`);

  contextPostCollections.set(contextKey, visiblePosts);
  grid.replaceChildren(
    ...visiblePosts.map((post, index) =>
      createPostGridItem(post, index, contextKey),
    ),
  );
}

function createContextFeedPost(post) {
  const postElement = document.createElement("div");
  postElement.className = "post";
  const isOwnPost = Boolean(currentUser && post.user_id === currentUser.id);

  // ✅ 타이머와 알고리즘 계산을 위해 데이터 심어두기
  postElement.dataset.postId = post.id || "";
  postElement.dataset.userId = post.user_id || "";
  postElement.dataset.mood = post.mood || "";
  postElement.dataset.bgmUrl = post.bgm_url || "";
  postElement.dataset.aiTerms = JSON.stringify(getPostAiTerms(post));

  const hasLiked = likedPostIds.has(post.id);
  const hasBookmarked = bookmarkedPostIds.has(post.id);

  postElement.innerHTML = `
    <div class="text-content"></div>
    <div class="author-info">
      <div class="author-name"></div>
      <div class="post-time"></div>
    </div>
    <div class="side-actions">
      <div class="action-btn" data-post-action="like">
        <span class="material-symbols-outlined icon-like">favorite</span>
        <span class="action-count"></span>
      </div>
      <div class="action-btn" data-post-action="comment">
        <span class="material-symbols-outlined">chat_bubble</span>
        <span class="action-count"></span>
      </div>
      <div class="action-btn" data-post-action="bookmark">
        <span class="material-symbols-outlined icon-bookmark">bookmark</span>
        <span class="action-count"></span>
      </div>
      <div class="action-btn" data-share-post>
        <span class="material-symbols-outlined">share</span>
        <span class="action-count">공유</span>
      </div>
      <div class="action-btn more-menu-wrapper" data-post-action="more">
        <span class="material-symbols-outlined">more_vert</span>
        <div class="more-menu">
          <button class="more-menu-item" type="button"></button>
        </div>
      </div>
    </div>`;

  const textElement = postElement.querySelector(".text-content");
  const authorElement = postElement.querySelector(".author-name");
  const timeElement = postElement.querySelector(".post-time");
  const likeButton = postElement.querySelector('[data-post-action="like"]');
  const commentButton = postElement.querySelector(
    '[data-post-action="comment"]',
  );
  const bookmarkButton = postElement.querySelector(
    '[data-post-action="bookmark"]',
  );
  const moreButton = postElement.querySelector('[data-post-action="more"]');
  const moreMenuItem = postElement.querySelector(".more-menu-item");

  textElement.textContent = String(post.content ?? "");
  authorElement.textContent = String(post.author || "익명");
  timeElement.textContent = timeForToday(post.created_at);

  if (post.user_id) {
    authorElement.classList.add("author-link");
    authorElement.addEventListener("click", () => openUserProfile(post.user_id));
  }

  const bgmControl = createPostBgmControl(post);
  if (bgmControl) timeElement.after(bgmControl);

  const likeIcon = likeButton.querySelector(".icon-like");
  if (hasLiked) {
    likeIcon.style.fontVariationSettings = "'FILL' 1";
    likeIcon.style.color = "#ff3b30";
  }
  likeButton.querySelector(".action-count").textContent = formatEngagementCount(post.likes_count);
  likeButton.addEventListener("click", () =>
    incrementMetric(post.id, "likes_count", likeButton),
  );

  commentButton.querySelector(".action-count").textContent = String(
    post.dislikes_count || 0,
  );
  commentButton.addEventListener("click", () =>
    openSheet("commentSheet", post.id),
  );

  const bookmarkIcon = bookmarkButton.querySelector(".icon-bookmark");
  if (hasBookmarked) {
    bookmarkIcon.style.fontVariationSettings = "'FILL' 1";
    bookmarkIcon.style.color = "#FFCC00";
  }
  bookmarkButton.querySelector(".action-count").textContent = hasBookmarked
    ? "담김"
    : "저장";
  bookmarkButton.addEventListener("click", () =>
    toggleBookmark(post.id, bookmarkButton),
  );

  moreButton.addEventListener("click", (event) =>
    toggleMoreMenu(moreButton, event),
  );
  moreMenuItem.textContent = isOwnPost ? "삭제" : "신고하기";
  moreMenuItem.addEventListener("click", (event) => {
    event.stopPropagation();
    moreButton.querySelector(".more-menu")?.classList.remove("show");
    if (isOwnPost) deletePost(post.id);
    else reportPost(post.id);
  });

  postElement
    .querySelector("[data-share-post]")
    ?.addEventListener("click", (event) =>
      sharePost(post, event.currentTarget),
    );

  return postElement;
}

function renderContextPostFeed(posts, startIndex) {
  const view = document.getElementById("view-context-feed");
  const feed = document.getElementById("contextPostFeed");
  contextObserver.disconnect();
  feed.replaceChildren();

  posts.forEach((post) => {
    const postElement = createContextFeedPost(post);
    feed.appendChild(postElement);
    fitPostTextToViewport(postElement);
    contextObserver.observe(postElement);
  });

  requestAnimationFrame(() => {
    const targetPost = feed.children[startIndex];
    view.style.scrollBehavior = "auto";
    view.scrollTop = targetPost ? targetPost.offsetTop : 0;
    requestAnimationFrame(() => {
      view.style.scrollBehavior = "";
      requestBgmSyncForView(view);
    });
  });
}

function openContextPostFeed(contextKey, startIndex = 0) {
  const posts = contextPostCollections.get(contextKey) || [];
  if (!posts.length) return;

  const activeView = document.querySelector(".app-view.active");
  if (activeView?.id !== "view-context-feed") {
    contextFeedReturnViewId = activeView?.id || "view-home";
  }

  document.getElementById("contextFeedTitle").innerText =
    contextPostTitles.get(contextKey) || "게시물";
  activateAppView("view-context-feed");
  renderContextPostFeed(posts, startIndex);
}

function closeContextPostFeed() {
  contextObserver.disconnect();
  activateAppView(contextFeedReturnViewId);
}

function addInteractiveSwipeBack(
  view,
  getPreviousViewId,
  onBack,
  options = {},
) {
  let touchStartX = 0;
  let touchStartY = 0;
  let swipeDistance = 0;
  let previousView = null;
  let isDragging = false;
  let isAnimating = false;

  const cleanUp = () => {
    view.classList.remove("swipe-back-current");
    view.style.transition = "";
    view.style.transform = "";
    if (previousView) {
      previousView.classList.remove("swipe-back-underlay");
      previousView.style.transition = "";
      previousView.style.transform = "";
      previousView.style.opacity = "";
    }
    previousView = null;
    isDragging = false;
    isAnimating = false;
    swipeDistance = 0;
  };

  const cancelSwipe = () => {
    if (!isDragging || isAnimating) return;
    isAnimating = true;
    view.style.transition = "transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)";
    view.style.transform = "translate3d(0, 0, 0)";
    if (previousView) {
      previousView.style.transition =
        "transform 0.22s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.22s ease";
      previousView.style.transform = "translate3d(-18%, 0, 0)";
      previousView.style.opacity = "0.72";
    }
    setTimeout(() => {
      options.onCancel?.();
      cleanUp();
    }, 230);
  };

  view.addEventListener(
    "touchstart",
    (event) => {
      if (isAnimating) return;
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
      swipeDistance = 0;
    },
    { passive: true },
  );

  view.addEventListener(
    "touchmove",
    (event) => {
      if (isAnimating) return;
      const deltaX = event.touches[0].clientX - touchStartX;
      const deltaY = event.touches[0].clientY - touchStartY;

      if (deltaX <= 0 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.1) return;
      event.preventDefault();

      if (!isDragging) {
        previousView = document.getElementById(getPreviousViewId());
        if (!previousView || previousView === view) return;
        prepareSwipeBackUnderlay(previousView);
        isDragging = true;
        view.classList.add("swipe-back-current");
        previousView.classList.add("swipe-back-underlay");
        previousView.style.transform = "translate3d(-18%, 0, 0)";
        previousView.style.opacity = "0.72";
        options.onStart?.();
      }

      swipeDistance = Math.min(deltaX, window.innerWidth);
      const progress = swipeDistance / window.innerWidth;
      view.style.transform = `translate3d(${swipeDistance}px, 0, 0)`;
      previousView.style.transform = `translate3d(${-18 + progress * 18}%, 0, 0)`;
      previousView.style.opacity = `${0.72 + progress * 0.28}`;
    },
    { passive: false },
  );

  view.addEventListener(
    "touchend",
    (event) => {
      if (!isDragging || isAnimating) return;
      swipeDistance = Math.max(
        0,
        Math.min(
          event.changedTouches[0].clientX - touchStartX,
          window.innerWidth,
        ),
      );
      const shouldGoBack = swipeDistance > window.innerWidth * 0.5;

      if (shouldGoBack) {
        isAnimating = true;
        view.style.transition = "transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)";
        view.style.transform = "translate3d(100vw, 0, 0)";
        previousView.style.transition =
          "transform 0.22s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.22s ease";
        previousView.style.transform = "translate3d(0, 0, 0)";
        previousView.style.opacity = "1";
        setTimeout(() => {
          onBack();
          cleanUp();
        }, 230);
      } else {
        cancelSwipe();
      }
    },
    { passive: true },
  );

  view.addEventListener(
    "touchcancel",
    () => {
      if (isDragging) {
        cancelSwipe();
      } else {
        cleanUp();
      }
    },
    { passive: true },
  );
}

function prepareNoticeSwipeUnderlay() {
  const noticeSheet = document.getElementById("noticeSheet");
  noticeSheet.style.transition = "none";
  noticeSheet.classList.add("open");
}

function cancelNoticeSwipeUnderlay() {
  closeSheet("noticeSheet");
}

function completeNoticeSwipeBack() {
  activateAppView(noticeReturnViewId);
  openSheet("noticeSheet");
}

function getAppViewBackRoutes() {
  return [
    {
      viewId: "view-bgm-picker",
      getPreviousViewId: () => "view-write",
      onBack: closeBgmPicker,
    },
    {
      viewId: "view-context-feed",
      getPreviousViewId: () => contextFeedReturnViewId,
      onBack: closeContextPostFeed,
    },
    {
      viewId: "view-user-profile",
      getPreviousViewId: () => userProfileReturnViewId,
      onBack: closeUserProfile,
    },
    {
      viewId: "view-settings",
      getPreviousViewId: () => "view-profile",
      onBack: closeSettingsView,
    },
    {
      viewId: "view-account-center",
      getPreviousViewId: () => "view-settings",
      onBack: closeAccountCenterView,
    },
    {
      viewId: "view-account-delete",
      getPreviousViewId: () => legalReturnViewId,
      onBack: closeAccountDeleteView,
    },
    {
      viewId: "view-theme-settings",
      getPreviousViewId: () => "view-settings",
      onBack: closeThemeSettingsView,
    },
    {
      viewId: "view-notification-settings",
      getPreviousViewId: () => "view-settings",
      onBack: closeNotificationSettingsView,
    },
    {
      viewId: "view-privacy-policy",
      getPreviousViewId: () => "view-settings",
      onBack: closePrivacyPolicyView,
    },
    {
      viewId: "view-terms-of-service",
      getPreviousViewId: () => "view-settings",
      onBack: closeTermsOfServiceView,
    },
    {
      viewId: "view-support",
      getPreviousViewId: () => "view-settings",
      onBack: closeSupportView,
    },
    {
      viewId: "view-community-standards",
      getPreviousViewId: () => "view-settings",
      onBack: closeCommunityStandardsView,
    },
    {
      viewId: "view-notice-detail",
      getPreviousViewId: () => noticeReturnViewId,
      onBack: completeNoticeSwipeBack,
      options: {
        onStart: prepareNoticeSwipeUnderlay,
        onCancel: cancelNoticeSwipeUnderlay,
      },
    },
  ];
}

function closeTopmostOpenSheet() {
  const sheetId = [
    "reportSheet",
    "moodSheet",
    "blockedUsersSheet",
    "followListSheet",
    "editProfileSheet",
    "noticeSheet",
    "commentSheet",
  ].find((id) => document.getElementById(id)?.classList.contains("open"));

  if (!sheetId) return false;
  closeSheet(sheetId);
  return true;
}

function closeVisibleMoreMenu() {
  const menus = Array.from(document.querySelectorAll(".more-menu.show"));
  if (!menus.length) return false;
  menus.forEach((menu) => menu.classList.remove("show"));
  return true;
}

function handleAppBackNavigation() {
  const appAlert = document.getElementById("appAlert");
  if (appAlert?.classList.contains("open")) {
    closeAppAlert(false);
    return true;
  }
  if (closeVisibleMoreMenu()) return true;
  if (closeTopmostOpenSheet()) return true;

  const activeViewId = document.querySelector(".app-view.active")?.id || "";
  const route = getAppViewBackRoutes().find(
    ({ viewId }) => viewId === activeViewId,
  );
  if (route) {
    route.onBack();
    return true;
  }

  if (activeViewId === "view-explore" && isExploreSearchOpen) {
    closeExploreSearch();
    return true;
  }

  if (
    activeViewId !== "view-home" &&
    ["view-explore", "view-write", "view-noti", "view-profile"].includes(
      activeViewId,
    )
  ) {
    switchTab("home");
    return true;
  }

  return false;
}

async function setupNativeBackNavigation() {
  const appPlugin = window.Capacitor?.Plugins?.App;
  if (!appPlugin?.addListener) return;

  try {
    await appPlugin.addListener("backButton", () => {
      if (handleAppBackNavigation()) return;
      appPlugin.exitApp();
    });
  } catch (error) {
    reportClientDiagnostic("native-back-navigation", error);
  }
}

function setupSwipeBackNavigation() {
  getAppViewBackRoutes().forEach(
    ({ viewId, getPreviousViewId, onBack, options }) => {
      addInteractiveSwipeBack(
        document.getElementById(viewId),
        getPreviousViewId,
        onBack,
        options,
      );
    },
  );
}

function renderFeedState(
  container,
  { title, description = "", allowRetry = false, kind = "error" },
) {
  const state = document.createElement("div");
  state.className = "feed-state";
  state.classList.add(kind === "empty" ? "is-empty" : "is-error");
  const titleElement = document.createElement("div");
  titleElement.className = "feed-state-title";
  titleElement.textContent = title;
  state.appendChild(titleElement);
  if (description) {
    const descriptionElement = document.createElement("p");
    descriptionElement.className = "feed-state-description";
    descriptionElement.textContent = description;
    state.appendChild(descriptionElement);
  }
  if (allowRetry) {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "feed-state-retry";
    retry.textContent = "다시 시도";
    retry.addEventListener("click", () => fetchPosts());
    state.appendChild(retry);
  }
  container.replaceChildren(state);
}

async function fetchPosts() {
  // ✅ 1. 일단 최신 글을 넉넉히(100개) 가져옵니다.
  const { data, error } = await runVisibleContentQuery(
    () =>
      client
        .from("posts")
        .select("*")
        .neq("author", "🚨글림 운영자")
        .order("created_at", { ascending: false })
        .limit(FEED_RECOMMENDATION_CANDIDATE_LIMIT),
    "feed-load",
  );

  const feedContainer = document.getElementById("postFeed");
  if (error) {
    reportClientDiagnostic("feed-load", error);
    renderFeedState(feedContainer, {
      title:
        navigator.onLine === false
          ? "연결이 끊겼습니다."
          : "문장을 불러오지 못했습니다.",
      description: "네트워크 상태를 확인한 뒤 다시 시도해주세요.",
      allowRetry: true,
    });
    return;
  }

  observer.disconnect();
  feedContainer.innerHTML = "";
  const visiblePosts = filterBlockedPosts(data);
  if (visiblePosts.length === 0) {
    renderFeedState(feedContainer, {
      title: "아직 보여드릴 문장이 없습니다.",
      kind: "empty",
    });
    return;
  }

  const postsWithAiProfiles = await attachAiProfilesToPosts(visiblePosts);
  const recommendedPosts = rankRecommendedPosts(
    postsWithAiProfiles,
    getFeedRecommendationSignals(),
  );

  recommendedPosts.forEach((post) => {
    const postElement = createContextFeedPost(post);
    feedContainer.appendChild(postElement);
    fitPostTextToViewport(postElement);
    observer.observe(postElement);
  });

  requestBgmSyncForView(document.getElementById("view-home"));
}

function renderExploreRailState(rail, message, isError = false) {
  const state = document.createElement("div");
  state.className = `explore-rail-state${isError ? " is-error" : ""}`;
  state.innerText = message;
  rail.replaceChildren(state);
}

function updateExploreCardMoreLabels() {
  const maxVisibleLines = 4;
  const truncatedTextLines = 3;

  document.querySelectorAll(".explore-hot-card").forEach((card) => {
    const copy = card.querySelector(".explore-card-copy");
    const copyText = card.querySelector(".explore-card-copy-text");
    const more = card.querySelector(".explore-card-more");
    if (!copy || !copyText || !more) return;

    const fullText = copy.dataset.fullText || "";
    const lineHeight = parseFloat(getComputedStyle(copy).lineHeight);
    const maxHeight = lineHeight * maxVisibleLines + 1;
    const truncatedTextMaxHeight = lineHeight * truncatedTextLines + 1;
    copy.classList.remove("is-truncated");
    copyText.innerText = fullText;
    more.hidden = true;

    if (copy.scrollHeight <= maxHeight) return;

    copy.classList.add("is-truncated");
    more.hidden = false;
    let low = 0;
    let high = fullText.length;

    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      copyText.innerText = fullText.slice(0, middle).trimEnd();
      if (copyText.scrollHeight <= truncatedTextMaxHeight) low = middle;
      else high = middle - 1;
    }

    let truncatedText = fullText.slice(0, low).trimEnd();
    copyText.innerText = truncatedText;
    while (copyText.scrollHeight > truncatedTextMaxHeight && truncatedText) {
      truncatedText = truncatedText.slice(0, -1).trimEnd();
      copyText.innerText = truncatedText;
    }
  });
}

function createExploreHotCard(
  post,
  index,
  contextKey = "explore-today",
  collectionLabel = "GLIM TODAY",
  orderLabel = "NO.",
) {
  const rank = String(index + 1).padStart(2, "0");
  const card = document.createElement("button");
  card.type = "button";
  card.className = "explore-hot-card";
  card.setAttribute(
    "aria-label",
    `${index + 1}번째, ${post.author || "익명"}의 게시물 열기`,
  );
  card.addEventListener("click", () =>
    openContextPostFeed(contextKey, index),
  );

  const rankGhost = document.createElement("span");
  rankGhost.className = "explore-card-rank-ghost";
  rankGhost.innerText = rank;
  rankGhost.setAttribute("aria-hidden", "true");

  const topline = document.createElement("div");
  topline.className = "explore-card-topline";

  const rankLabel = document.createElement("span");
  rankLabel.className = "explore-card-rank";
  rankLabel.innerText = `${orderLabel} ${rank}`;

  const pickLabel = document.createElement("span");
  pickLabel.innerText = collectionLabel;
  topline.append(rankLabel, pickLabel);

  const rule = document.createElement("div");
  rule.className = "explore-card-rule";
  rule.setAttribute("aria-hidden", "true");

  const copy = document.createElement("p");
  copy.className = "explore-card-copy";
  copy.dataset.fullText = post.content;

  const copyText = document.createElement("span");
  copyText.className = "explore-card-copy-text";
  copyText.innerText = post.content;

  const more = document.createElement("span");
  more.className = "explore-card-more";
  more.innerText = "이어 읽기 →";
  more.hidden = true;
  more.setAttribute("aria-hidden", "true");
  copy.append(copyText, more);

  const footer = document.createElement("div");
  footer.className = "explore-card-footer";

  const author = document.createElement("span");
  author.className = "explore-card-author";
  author.innerText = post.author || "익명";

  const likes = document.createElement("span");
  likes.className = "explore-card-likes";

  const likeIcon = document.createElement("span");
  likeIcon.className = "material-symbols-outlined";
  likeIcon.innerText = "favorite";
  likeIcon.setAttribute("aria-hidden", "true");

  const likeCount = document.createElement("span");
  likeCount.innerText = formatEngagementCount(post.likes_count);
  likes.append(likeIcon, likeCount);
  footer.append(author, likes);

  card.append(rankGhost, topline, rule, copy, footer);
  return card;
}

function scheduleExploreCardLayout() {
  requestAnimationFrame(updateExploreCardMoreLabels);
  document.fonts?.ready.then(updateExploreCardMoreLabels);
}

function renderExplorePostCollection({
  rail,
  data,
  error,
  contextKey,
  contextTitle,
  collectionLabel,
  orderLabel = "NO.",
  emptyMessage,
}) {
  rail.setAttribute("aria-busy", "false");
  if (error) {
    contextPostCollections.set(contextKey, []);
    renderExploreRailState(rail, "문장을 불러오지 못했어요.", true);
    return;
  }
  const visiblePosts = filterBlockedPosts(data).slice(0, 10);
  if (!visiblePosts.length) {
    contextPostCollections.set(contextKey, []);
    renderExploreRailState(rail, emptyMessage);
    return;
  }

  contextPostCollections.set(contextKey, visiblePosts);
  contextPostTitles.set(contextKey, contextTitle);
  const cards = visiblePosts.map((post, index) =>
    createExploreHotCard(
      post,
      index,
      contextKey,
      collectionLabel,
      orderLabel,
    ),
  );
  rail.replaceChildren(...cards);
  scheduleExploreCardLayout();
}

function renderExploreMoodTabs() {
  const tabs = document.getElementById("exploreMoodTabs");
  if (!tabs) return;

  const buttons = MOOD_OPTIONS.map((mood) => {
    const button = document.createElement("button");
    const isSelected = mood.value === selectedExploreMood;
    button.type = "button";
    button.className = `explore-mood-tab${isSelected ? " is-selected" : ""}`;
    button.innerText = mood.label;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(isSelected));
    button.addEventListener("click", () => selectExploreMood(mood.value));
    return button;
  });
  tabs.replaceChildren(...buttons);
}

async function fetchExploreMoodPosts(keyword = "") {
  const rail = document.getElementById("exploreMoodRail");
  const description = document.getElementById("exploreMoodDescription");
  if (!rail || !description) return;

  const requestId = ++exploreMoodFetchRequestId;
  const mood =
    MOOD_OPTIONS_BY_VALUE.get(selectedExploreMood) || MOOD_OPTIONS[0];
  const contextKey = "explore-mood";
  contextPostCollections.set(contextKey, []);
  contextPostTitles.set(contextKey, `${mood.label} 감성`);
  description.innerText = keyword
    ? `‘${keyword}’이 담긴 ${mood.label} 글`
    : mood.description;
  rail.scrollLeft = 0;
  rail.setAttribute("aria-busy", "true");
  renderExploreRailState(rail, `${mood.label} 글을 모으는 중...`);

  const buildMoodQuery = () => {
    let query = client
      .from("posts")
      .select("*")
      .neq("author", "🚨글림 운영자")
      .eq("mood", mood.value)
      .order("created_at", { ascending: false })
      .limit(30);
    if (keyword) query = query.ilike("content", `%${keyword}%`);
    return query;
  };

  const { data, error } = await runVisibleContentQuery(
    buildMoodQuery,
    "explore-mood-posts-load",
  );
  if (requestId !== exploreMoodFetchRequestId) return;

  renderExplorePostCollection({
    rail,
    data,
    error,
    contextKey,
    contextTitle: `${mood.label} 감성`,
    collectionLabel: `${mood.label} MOOD`,
    orderLabel: "NEW",
    emptyMessage: keyword
      ? `검색된 ${mood.label} 글이 없어요.`
      : `아직 ${mood.label} 글이 없어요.`,
  });
}

function selectExploreMood(moodValue) {
  if (!MOOD_OPTIONS_BY_VALUE.has(moodValue)) return;
  selectedExploreMood = moodValue;
  renderExploreMoodTabs();
  fetchExploreMoodPosts(
    document.getElementById("searchInput")?.value.trim() || "",
  );
}

async function fetchExplorePosts(keyword = "") {
  const todayRail = document.getElementById("exploreHotRail");
  const allTimeRail = document.getElementById("exploreAllTimeRail");
  const todayDescription = document.getElementById("exploreHotDescription");
  const allTimeDescription = document.getElementById(
    "exploreAllTimeDescription",
  );
  if (
    !todayRail ||
    !allTimeRail ||
    !todayDescription ||
    !allTimeDescription
  )
    return;

  const requestId = ++exploreFetchRequestId;
  const todayContextKey = "explore-today";
  const allTimeContextKey = "explore-all-time";
  contextPostCollections.set(todayContextKey, []);
  contextPostCollections.set(allTimeContextKey, []);
  contextPostTitles.set(
    todayContextKey,
    keyword ? `‘${keyword}’ 오늘의 공감` : "오늘의 가장 따뜻한 공감",
  );
  contextPostTitles.set(
    allTimeContextKey,
    keyword ? `‘${keyword}’ 역대 인기 문장` : "역대 좋아요 TOP 10",
  );

  todayDescription.innerText = keyword
    ? `오늘의 ‘${keyword}’ 글을 공감 순으로 모았어요`
    : "오늘 가장 많은 마음이 머문 문장 10편";
  allTimeDescription.innerText = keyword
    ? `‘${keyword}’ 글을 역대 좋아요 순으로 모았어요`
    : "지금까지 좋아요가 가장 많았던 문장";

  [todayRail, allTimeRail].forEach((rail) => {
    rail.scrollLeft = 0;
    rail.setAttribute("aria-busy", "true");
    renderExploreRailState(rail, "문장을 고르는 중...");
  });
  renderExploreMoodTabs();
  const moodRequest = fetchExploreMoodPosts(keyword);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const buildTodayQuery = () => {
    let query = client
      .from("posts")
      .select("*")
      .neq("author", "🚨글림 운영자")
      .gte("created_at", startOfToday.toISOString())
      .order("likes_count", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30);
    if (keyword) query = query.ilike("content", `%${keyword}%`);
    return query;
  };
  const buildAllTimeQuery = () => {
    let query = client
      .from("posts")
      .select("*")
      .neq("author", "🚨글림 운영자")
      .order("likes_count", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30);
    if (keyword) query = query.ilike("content", `%${keyword}%`);
    return query;
  };

  const [todayResult, allTimeResult] = await Promise.all([
    runVisibleContentQuery(buildTodayQuery, "explore-today-posts-load"),
    runVisibleContentQuery(buildAllTimeQuery, "explore-all-time-posts-load"),
  ]);
  if (requestId !== exploreFetchRequestId) {
    await moodRequest;
    return;
  }

  renderExplorePostCollection({
    rail: todayRail,
    ...todayResult,
    contextKey: todayContextKey,
    contextTitle: keyword
      ? `‘${keyword}’ 오늘의 공감`
      : "오늘의 가장 따뜻한 공감",
    collectionLabel: "GLIM TODAY",
    emptyMessage: keyword
      ? "오늘 검색된 문장이 없어요."
      : "오늘 올라온 문장이 아직 없어요.",
  });
  renderExplorePostCollection({
    rail: allTimeRail,
    ...allTimeResult,
    contextKey: allTimeContextKey,
    contextTitle: keyword
      ? `‘${keyword}’ 역대 인기 문장`
      : "역대 좋아요 TOP 10",
    collectionLabel: "ALL-TIME",
    emptyMessage: keyword
      ? "검색된 문장이 없어요."
      : "아직 좋아요를 받은 문장이 없어요.",
  });
  await moodRequest;
}

function getExploreSearchHistory() {
  try {
    const history = JSON.parse(
      localStorage.getItem(EXPLORE_SEARCH_HISTORY_KEY) || "[]",
    );
    return Array.isArray(history)
      ? history.filter((item) => typeof item === "string" && item.trim())
      : [];
  } catch (_error) {
    return [];
  }
}

function saveExploreSearchHistory(query) {
  const nextHistory = [
    query,
    ...getExploreSearchHistory().filter((item) => item !== query),
  ].slice(0, EXPLORE_SEARCH_HISTORY_LIMIT);
  localStorage.setItem(
    EXPLORE_SEARCH_HISTORY_KEY,
    JSON.stringify(nextHistory),
  );
}

function renderExploreSearchHistory() {
  const list = document.getElementById("exploreSearchHistoryList");
  if (!list) return;

  const history = getExploreSearchHistory();
  if (!history.length) {
    list.innerHTML =
      '<div class="explore-search-state">최근 검색 기록 없음</div>';
    return;
  }

  const rows = history.map((query) => {
    const row = document.createElement("div");
    row.className = "explore-search-history-row";

    const queryButton = document.createElement("button");
    queryButton.type = "button";
    queryButton.className = "explore-search-history-query";
    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined";
    icon.innerText = "history";
    const text = document.createElement("span");
    text.innerText = query;
    queryButton.append(icon, text);
    queryButton.addEventListener("click", () => searchPosts(query));

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "explore-search-history-remove";
    removeButton.setAttribute("aria-label", `${query} 검색 기록 삭제`);
    const removeIcon = document.createElement("span");
    removeIcon.className = "material-symbols-outlined";
    removeIcon.innerText = "close";
    removeButton.appendChild(removeIcon);
    removeButton.addEventListener("click", () => {
      const nextHistory = getExploreSearchHistory().filter(
        (item) => item !== query,
      );
      localStorage.setItem(
        EXPLORE_SEARCH_HISTORY_KEY,
        JSON.stringify(nextHistory),
      );
      renderExploreSearchHistory();
    });

    row.append(queryButton, removeButton);
    return row;
  });
  list.replaceChildren(...rows);
}

function openExploreSearch() {
  const wasOpen = isExploreSearchOpen;
  isExploreSearchOpen = true;
  document.getElementById("exploreHeader")?.classList.add("is-searching");
  const discovery = document.getElementById("exploreDiscoveryContent");
  const searchContent = document.getElementById("exploreSearchContent");
  if (discovery) discovery.hidden = true;
  if (searchContent) searchContent.hidden = false;
  if (!wasOpen) {
    document.getElementById("view-explore")?.scrollTo({ top: 0 });
  }

  const query = document.getElementById("searchInput")?.value.trim() || "";
  if (!query) {
    document.getElementById("exploreRecentSearches").hidden = false;
    document.getElementById("exploreSearchResults").hidden = true;
    renderExploreSearchHistory();
  }
}

function closeExploreSearch() {
  if (exploreSearchInputTimer) {
    clearTimeout(exploreSearchInputTimer);
    exploreSearchInputTimer = null;
  }
  exploreSearchRequestId += 1;
  isExploreSearchOpen = false;
  document.getElementById("exploreHeader")?.classList.remove("is-searching");
  const input = document.getElementById("searchInput");
  const discovery = document.getElementById("exploreDiscoveryContent");
  const searchContent = document.getElementById("exploreSearchContent");
  if (input) {
    input.value = "";
    input.blur();
  }
  if (discovery) discovery.hidden = false;
  if (searchContent) searchContent.hidden = true;
}

async function refreshExploreCurrentContent() {
  const query = document.getElementById("searchInput")?.value.trim() || "";
  if (isExploreSearchOpen && query) {
    await searchPosts(query);
  } else {
    await fetchExplorePosts("");
  }
}

function handleExploreSearchInput(event) {
  openExploreSearch();
  const query = document.getElementById("searchInput")?.value.trim() || "";
  if (exploreSearchInputTimer) clearTimeout(exploreSearchInputTimer);
  exploreSearchInputTimer = null;
  exploreSearchRequestId += 1;

  if (event?.isComposing) {
    return;
  }

  if (!query) {
    document.getElementById("exploreRecentSearches").hidden = false;
    document.getElementById("exploreSearchResults").hidden = true;
    renderExploreSearchHistory();
    return;
  }

  renderExploreSearchLoading(query);
  exploreSearchInputTimer = setTimeout(() => {
    exploreSearchInputTimer = null;
    void searchPosts(query, { saveHistory: false });
  }, EXPLORE_SEARCH_INPUT_DELAY_MS);
}

function clearExploreSearchHistory() {
  localStorage.removeItem(EXPLORE_SEARCH_HISTORY_KEY);
  renderExploreSearchHistory();
}

function createExploreUserResult(profile) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "explore-user-result";
  button.addEventListener("click", () => openUserProfile(profile.id));

  const avatar = document.createElement("span");
  avatar.className = "explore-user-result-avatar";
  renderAvatarElement(avatar, profile.avatar_url, "1.5rem");

  const copy = document.createElement("span");
  copy.className = "explore-user-result-copy";
  const name = document.createElement("span");
  name.className = "explore-user-result-name";
  name.innerText = profile.nickname || "이름 없는 사용자";
  const customId = document.createElement("span");
  customId.className = "explore-user-result-id";
  customId.innerText = `@${profile.custom_id || profile.nickname || "user"}`;
  copy.append(name, customId);

  const chevron = document.createElement("span");
  chevron.className = "material-symbols-outlined settings-row-chevron";
  chevron.innerText = "chevron_right";
  button.append(avatar, copy, chevron);
  return button;
}

function createExploreSearchPost(post, index) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "explore-search-post";
  button.addEventListener("click", () =>
    openContextPostFeed("explore-search", index),
  );

  const content = document.createElement("p");
  content.className = "explore-search-post-content";
  content.innerText = post.content;

  const meta = document.createElement("div");
  meta.className = "explore-search-post-meta";
  const author = document.createElement("span");
  author.innerText = post.author || "익명";
  const mood = document.createElement("span");
  const moodOption = getMoodOption(post.mood);
  mood.innerText = `${moodOption?.label || "감성"} · 좋아요 ${formatEngagementCount(post.likes_count)}`;
  meta.append(author, mood);
  button.append(content, meta);
  return button;
}

function renderExploreSearchLoading(query) {
  document.getElementById("exploreRecentSearches").hidden = true;
  document.getElementById("exploreSearchResults").hidden = false;
  document.getElementById("exploreSearchSummary").innerText =
    `‘${query}’ 검색 중...`;
  document.getElementById("exploreSearchEmptyAll").hidden = true;
  document.getElementById("exploreUserResultGroup").hidden = false;
  document.getElementById("explorePostResultGroup").hidden = false;
  document.getElementById("exploreUserResults").innerHTML =
    '<div class="explore-search-state">유저를 찾는 중...</div>';
  document.getElementById("explorePostResults").innerHTML =
    '<div class="explore-search-state">게시물을 찾는 중...</div>';
}

function renderExploreSearchResults(query, users, posts) {
  const userGroup = document.getElementById("exploreUserResultGroup");
  const postGroup = document.getElementById("explorePostResultGroup");
  const userList = document.getElementById("exploreUserResults");
  const postList = document.getElementById("explorePostResults");
  const emptyAll = document.getElementById("exploreSearchEmptyAll");

  document.getElementById("exploreSearchSummary").innerText =
    `‘${query}’ 검색 결과`;
  if (!users.length && !posts.length) {
    userGroup.hidden = true;
    postGroup.hidden = true;
    emptyAll.hidden = false;
    emptyAll.className = "explore-search-empty-all";
    emptyAll.innerHTML = `
      <span class="material-symbols-outlined">search_off</span>
      <span>검색 결과 없음</span>
    `;
    return;
  }

  emptyAll.hidden = true;
  userGroup.hidden = false;
  postGroup.hidden = false;
  if (users.length) {
    userList.replaceChildren(...users.map(createExploreUserResult));
  } else {
    userList.innerHTML = '<div class="explore-search-state">유저 없음</div>';
  }
  if (posts.length) {
    contextPostCollections.set("explore-search", posts);
    contextPostTitles.set("explore-search", `‘${query}’ 게시물`);
    postList.replaceChildren(
      ...posts.map((post, index) => createExploreSearchPost(post, index)),
    );
  } else {
    contextPostCollections.set("explore-search", []);
    postList.innerHTML =
      '<div class="explore-search-state">게시물 없음</div>';
  }
}

async function searchPosts(forcedQuery = null, { saveHistory = true } = {}) {
  if (exploreSearchInputTimer) {
    clearTimeout(exploreSearchInputTimer);
    exploreSearchInputTimer = null;
  }
  const input = document.getElementById("searchInput");
  const query = String(forcedQuery ?? input?.value ?? "").trim();
  if (!query) {
    openExploreSearch();
    renderExploreSearchHistory();
    return;
  }

  if (input) input.value = query;
  openExploreSearch();
  if (saveHistory) saveExploreSearchHistory(query);
  renderExploreSearchLoading(query);
  const requestId = ++exploreSearchRequestId;
  contextPostCollections.set("explore-search", []);

  const profileFields = "id, nickname, custom_id, avatar_url";
  const [nicknameResult, customIdResult, postResult] = await Promise.all([
    client
      .from("profiles")
      .select(profileFields)
      .ilike("nickname", `%${query}%`)
      .limit(10),
    client
      .from("profiles")
      .select(profileFields)
      .ilike("custom_id", `%${query}%`)
      .limit(10),
    runVisibleContentQuery(
      () =>
        client
          .from("posts")
          .select("*")
          .neq("author", "🚨글림 운영자")
          .ilike("content", `%${query}%`)
          .order("created_at", { ascending: false })
          .limit(50),
      "explore-search-posts-load",
    ),
  ]);
  if (requestId !== exploreSearchRequestId) return;

  const usersById = new Map();
  [...(nicknameResult.data || []), ...(customIdResult.data || [])].forEach(
    (profile) => {
      if (!blockedUserIds.has(profile.id)) usersById.set(profile.id, profile);
    },
  );
  const normalizedQuery = query.toLocaleLowerCase("ko-KR");
  const users = Array.from(usersById.values()).sort((a, b) => {
    const nameA = (a.nickname || "").toLocaleLowerCase("ko-KR");
    const nameB = (b.nickname || "").toLocaleLowerCase("ko-KR");
    const scoreA =
      nameA === normalizedQuery ? 0 : nameA.startsWith(normalizedQuery) ? 1 : 2;
    const scoreB =
      nameB === normalizedQuery ? 0 : nameB.startsWith(normalizedQuery) ? 1 : 2;
    return scoreA - scoreB || nameA.localeCompare(nameB, "ko-KR");
  });
  const posts = filterBlockedPosts(postResult.data || []);

  if (
    nicknameResult.error &&
    customIdResult.error &&
    postResult.error
  ) {
    document.getElementById("exploreSearchSummary").innerText =
      `‘${query}’ 검색 결과`;
    document.getElementById("exploreUserResultGroup").hidden = true;
    document.getElementById("explorePostResultGroup").hidden = true;
    const emptyAll = document.getElementById("exploreSearchEmptyAll");
    emptyAll.hidden = false;
    emptyAll.className = "explore-search-empty-all";
    emptyAll.innerHTML =
      '<span class="material-symbols-outlined">error</span><span>검색 결과를 불러오지 못했어요.</span>';
    return;
  }

  renderExploreSearchResults(query, users, posts);
}

async function incrementMetric(postId, column, element) {
  if (column !== "likes_count") return;
  if (!currentUser) return alert("좋아요를 누르려면 로그인이 필요합니다.");
  if (element.dataset.pending === "true") return;

  const countSpan = element.querySelector(".action-count");
  const icon = element.querySelector(".icon-like");
  const wasLiked = likedPostIds.has(postId);
  element.dataset.pending = "true";

  const { data, error } = await client.rpc("toggle_post_like", {
    target_post_id: postId,
  });
  delete element.dataset.pending;

  if (error) {
    showAppAlert(
      getContentSubmissionErrorMessage(
        error,
        "좋아요를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
      ),
    );
    return;
  }

  const result = Array.isArray(data) ? data[0] : data;
  const isLiked = Boolean(result?.liked);
  if (isLiked) likedPostIds.add(postId);
  else likedPostIds.delete(postId);

  countSpan.innerText = formatEngagementCount(result?.total_count);
  icon.style.fontVariationSettings = isLiked ? "'FILL' 1" : "'FILL' 0";
  icon.style.color = isLiked ? "#ff3b30" : "#ccc";
  localStorage.removeItem(`liked_${currentUser.id}_${postId}`);

  if (!isLiked || wasLiked) return;
  const postElement = element.closest(".post");
  updateMoodScore(postElement?.dataset.mood, 5);
  updateAiPreferenceScoresFromElement(postElement, 4);

  const { data: postData, error: postError } = await runVisibleContentQuery(
    () =>
      client
        .from("posts")
        .select("author, user_id")
        .eq("id", postId),
    "reaction-post-load",
    (query) => query.maybeSingle(),
  );
  if (postError || !postData?.user_id || postData.user_id === currentUser.id)
    return;

  const myNickname = getCurrentAuthorNickname();
  const { error: notificationError } = await client
    .from("notifications")
    .insert([
      {
        target_user: postData.author,
        target_user_id: postData.user_id,
        actor_nickname: myNickname,
        actor_user_id: currentUser.id,
        type: "like",
        post_id: postId,
      },
    ]);
  if (notificationError) {
    reportClientDiagnostic("reaction-notification-save", notificationError);
  }
  void sendPushNotification(postData.user_id, "likes", postId);
}

async function toggleBookmark(postId, element) {
  if (!currentUser) return alert("북마크를 이용하려면 로그인이 필요합니다.");
  if (element.dataset.pending === "true") return;
  const icon = element.querySelector(".icon-bookmark");
  const countSpan = element.querySelector(".action-count");
  const wasBookmarked = bookmarkedPostIds.has(postId);
  element.dataset.pending = "true";

  const { data: isBookmarked, error } = await client.rpc(
    "toggle_post_bookmark",
    { target_post_id: postId },
  );
  delete element.dataset.pending;
  if (error) {
    showAppAlert(
      getContentSubmissionErrorMessage(
        error,
        "북마크를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
      ),
    );
    return;
  }

  if (isBookmarked) bookmarkedPostIds.add(postId);
  else bookmarkedPostIds.delete(postId);
  icon.style.fontVariationSettings = isBookmarked ? "'FILL' 1" : "'FILL' 0";
  icon.style.color = isBookmarked ? "#FFCC00" : "#ccc";
  countSpan.innerText = isBookmarked ? "담김" : "저장";
  localStorage.removeItem(`bookmarked_${currentUser.id}_${postId}`);

  if (isBookmarked && !wasBookmarked) {
    const postElement = element.closest(".post");
    updateMoodScore(postElement?.dataset.mood, 8);
    updateAiPreferenceScoresFromElement(postElement, 6);
  }
}

function getCommentSourcePostElement(postId) {
  if (!postId) return null;
  const targetPostId = String(postId);
  const candidates = [...document.querySelectorAll(".post")].filter(
    (element) => element.dataset.postId === targetPostId,
  );
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  return candidates.find((element) => {
    if (!element.closest(".app-view.active")) return false;
    const rect = element.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < viewportHeight;
  })
    || candidates.find((element) => element.closest(".app-view.active"))
    || candidates[0]
    || null;
}

function clearCommentSourcePost() {
  if (pendingCommentSourceAnimationFrame) {
    cancelAnimationFrame(pendingCommentSourceAnimationFrame);
    pendingCommentSourceAnimationFrame = 0;
  }
  pendingCommentSourceScrollTimers.forEach((timerId) => clearTimeout(timerId));
  pendingCommentSourceScrollTimers = [];
  const sourceView = currentCommentSourceViewElement;
  const sourceScrollTop = currentCommentSourceScrollTop;
  currentCommentSourceViewElement = null;
  currentCommentSourceScrollTop = 0;
  const placeholder = currentCommentSourcePlaceholderElement;
  currentCommentSourcePlaceholderElement = null;
  if (!currentCommentPostElement) {
    placeholder?.remove();
    return;
  }
  currentCommentPostElement.classList.remove(
    "is-comment-source",
    "is-comment-source-dragging",
  );
  currentCommentPostElement.style.removeProperty("--comment-source-y");
  currentCommentPostElement.style.removeProperty("--comment-source-scale");
  placeholder?.remove();
  if (sourceView) {
    const restoreScroll = () => {
      sourceView.scrollTop = sourceScrollTop;
    };
    restoreScroll();
    requestAnimationFrame(restoreScroll);
    [80, 180, 360, 620].forEach((delay) => setTimeout(restoreScroll, delay));
    setTimeout(() => {
      restoreScroll();
      sourceView.classList.remove("is-comment-source-active");
    }, 700);
  }
  currentCommentPostElement = null;
}

function pinCommentSourceScrollPosition() {
  if (!currentCommentSourceViewElement) return;
  currentCommentSourceViewElement.scrollTop = currentCommentSourceScrollTop;
}

function scheduleCommentSourceScrollPin() {
  pendingCommentSourceScrollTimers.forEach((timerId) => clearTimeout(timerId));
  pendingCommentSourceScrollTimers = COMMENT_SOURCE_SCROLL_PIN_DELAYS_MS.map(
    (delay) => setTimeout(pinCommentSourceScrollPosition, delay),
  );
}

function updateCommentSourcePostMotion(progress, dragDistance = 0) {
  if (!currentCommentPostElement) return;
  const nextProgress = clampCommentSheetProgress(progress);
  const dragOffset = Math.max(0, dragDistance) * COMMENT_SHEET_DRAG_TRANSLATE_RATIO;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const expectedSheetHeight = viewportHeight
    * (COMMENT_SHEET_REST_HEIGHT_DVH
      + (COMMENT_SHEET_FOCUSED_HEIGHT_DVH - COMMENT_SHEET_REST_HEIGHT_DVH)
        * nextProgress)
    / 100;
  const sheet = document.getElementById("commentSheet");
  const renderedSheetHeight = sheet?.classList.contains("open")
    ? sheet.getBoundingClientRect().height
    : 0;
  const activeSheetHeight = dragDistance > 0
    ? (renderedSheetHeight || expectedSheetHeight)
    : Math.max(renderedSheetHeight, expectedSheetHeight);
  const sheetHeight = Math.min(activeSheetHeight, 640);
  const focusedSheetHeight = Math.min(
    viewportHeight * COMMENT_SHEET_FOCUSED_HEIGHT_DVH / 100,
    640,
  );
  const isFocusedSheetDrag = dragDistance > 0
    && document.getElementById("commentSheet")?.classList.contains("is-input-focused");
  const sheetResizeFollowOffset = isFocusedSheetDrag
    ? Math.max(0, focusedSheetHeight - sheetHeight) / 2
    : 0;
  const sourceY = -sheetHeight * COMMENT_SOURCE_SHEET_LIFT_RATIO + dragOffset + sheetResizeFollowOffset;
  const sourceScale = 1 - COMMENT_SOURCE_FOCUSED_SCALE_DELTA * nextProgress;

  currentCommentPostElement.style.setProperty("--comment-source-y", String(sourceY) + "px");
  currentCommentPostElement.style.setProperty("--comment-source-scale", String(sourceScale));
  pinCommentSourceScrollPosition();
  requestAnimationFrame(pinCommentSourceScrollPosition);
  scheduleCommentSourceScrollPin();
}

function setCommentSourcePost(postId) {
  clearCommentSourcePost();
  currentCommentPostElement = getCommentSourcePostElement(postId);
  if (!currentCommentPostElement) return;
  currentCommentSourceViewElement = currentCommentPostElement.closest(".app-view");
  currentCommentSourceScrollTop = currentCommentSourceViewElement?.scrollTop || 0;
  currentCommentSourceViewElement?.classList.add("is-comment-source-active");
  currentCommentSourcePlaceholderElement = document.createElement("div");
  currentCommentSourcePlaceholderElement.className = "comment-source-placeholder";
  currentCommentPostElement.after(currentCommentSourcePlaceholderElement);
  currentCommentPostElement.classList.add("is-comment-source", "is-visible");
  currentCommentPostElement.style.setProperty("--comment-source-y", "0px");
  currentCommentPostElement.style.setProperty("--comment-source-scale", "1");
  pendingCommentSourceAnimationFrame = requestAnimationFrame(() => {
    pendingCommentSourceAnimationFrame = 0;
    updateCommentSourcePostMotion(0);
  });
}

function createCommentMentionChip(nickname) {
  const cleanNickname = String(nickname || "").replace(/^@+/, "").trim();
  if (!cleanNickname) return null;
  const chip = document.createElement("span");
  chip.className = "comment-mention-chip";
  chip.contentEditable = "false";
  chip.dataset.mentionValue = "@" + cleanNickname;
  const label = document.createElement("span");
  label.className = "comment-mention-label";
  label.textContent = "@" + cleanNickname;
  const removeButton = document.createElement("button");
  removeButton.className = "comment-mention-remove";
  removeButton.type = "button";
  removeButton.setAttribute("aria-label", "답글 대상 제거");
  removeButton.textContent = "×";
  chip.append(label, removeButton);
  return chip;
}

function serializeCommentInputNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  if (node.classList?.contains("comment-mention-chip")) {
    return node.dataset.mentionValue || node.textContent || "";
  }
  if (node.tagName === "BR") return "\n";
  return Array.from(node.childNodes).map(serializeCommentInputNode).join("");
}

function clearCommentReplyTarget() {
  pendingCommentReplyTarget = null;
}

function setCommentInputCaretAfterMention(input) {
  const selection = window.getSelection?.();
  if (!input || !selection) return;
  let spacer = input.querySelector(".comment-mention-chip")?.nextSibling || null;
  if (!spacer || spacer.nodeType !== Node.TEXT_NODE) {
    spacer = document.createTextNode(" ");
    input.append(spacer);
  }
  const range = document.createRange();
  range.setStart(spacer, Math.min(1, spacer.textContent.length));
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function removeCommentMentionChip(input = document.getElementById("commentInput")) {
  const chip = input?.querySelector(".comment-mention-chip");
  if (!input || !chip) return;
  const nextNode = chip.nextSibling;
  chip.remove();
  if (nextNode?.nodeType === Node.TEXT_NODE) {
    nextNode.textContent = nextNode.textContent.replace(/^\s+/, "");
  }
  clearCommentReplyTarget();
}

function setCommentReplyTarget(commentId, nickname) {
  const input = document.getElementById("commentInput");
  const cleanNickname = String(nickname || "").replace(/^@+/, "").trim();
  if (!input || !cleanNickname) return;
  const chip = createCommentMentionChip(cleanNickname);
  if (!chip) return;
  pendingCommentReplyTarget = { commentId, nickname: cleanNickname };
  input.replaceChildren(chip, document.createTextNode(" "));
  input.focus();
  setCommentInputCaretAfterMention(input);
  requestAnimationFrame(() => {
    input.focus();
    setCommentInputCaretAfterMention(input);
  });
}

function syncCommentMentionChipFromText() {
  const input = document.getElementById("commentInput");
  if (!input || input.querySelector(".comment-mention-chip")) return;
  const text = input.textContent || "";
  const match = text.match(/^@([^\s@]{3,20})(\s*)([\s\S]*)$/);
  if (!match) return;
  const chip = createCommentMentionChip(match[1]);
  if (!chip) return;
  pendingCommentReplyTarget = { commentId: null, nickname: match[1] };
  input.replaceChildren(chip, document.createTextNode(" " + (match[3] || "")));
  setCommentInputCaretAfterMention(input);
}
function getCommentInputContent() {
  const input = document.getElementById("commentInput");
  if (!input) return "";
  return Array.from(input.childNodes)
    .map(serializeCommentInputNode)
    .join("")
    .replace(/ /g, " ")
    .trim();
}

function clearCommentInputContent() {
  const input = document.getElementById("commentInput");
  if (input) input.replaceChildren();
  clearCommentReplyTarget();
}

function openSheet(id, postId = null) {
  if (id === "commentSheet") {
    currentPostIdForComment = postId;
    setCommentSourcePost(postId);
    fetchComments(postId);
  }
  const sheet = document.getElementById(id);
  const backdrop = document.getElementById(id + "Backdrop");
  sheet.style.transition = id === "commentSheet"
    ? ""
    : "bottom 0.4s cubic-bezier(0.25, 1, 0.5, 1)";
  sheet.classList.add("open");
  backdrop?.classList.add("open");
}

function closeSheet(id) {
  const sheet = document.getElementById(id);
  const backdrop = document.getElementById(`${id}Backdrop`);
  sheet.classList.remove("open");
  sheet.style.transform = "";
  backdrop?.classList.remove("open");
  if (id === "editProfileSheet") resetEditProfileAvatarState();
  if (id === "commentSheet") {
    settleCommentSheetFocus(false);
    document.getElementById("commentInput")?.blur();
    clearCommentInputContent();
    clearCommentSourcePost();
    currentPostIdForComment = null;
  }
  if (id === "reportSheet") pendingReportTarget = null;
}

function clampCommentSheetProgress(progress) {
  return Math.min(1, Math.max(0, Number(progress) || 0));
}

function applyCommentSheetFocusProgress(progress, dragDistance = 0) {
  const sheet = document.getElementById("commentSheet");
  const nextProgress = clampCommentSheetProgress(progress);
  const nextHeight = COMMENT_SHEET_REST_HEIGHT_DVH
    + (COMMENT_SHEET_FOCUSED_HEIGHT_DVH - COMMENT_SHEET_REST_HEIGHT_DVH) * nextProgress;
  const dragOffset = Math.max(0, dragDistance) * COMMENT_SHEET_DRAG_TRANSLATE_RATIO;

  sheet?.style.setProperty("--comment-sheet-height", String(nextHeight) + "dvh");
  sheet?.style.setProperty("--comment-sheet-drag", String(dragOffset) + "px");
  updateCommentSourcePostMotion(nextProgress, dragDistance);
}

function setCommentSheetDragging(isDragging) {
  const sheet = document.getElementById("commentSheet");
  isCommentSheetDragging = isDragging;
  sheet?.classList.toggle("is-dragging", isDragging);
  currentCommentPostElement?.classList.toggle("is-comment-source-dragging", isDragging);
}

function settleCommentSheetFocus(isFocused) {
  const sheet = document.getElementById("commentSheet");
  sheet?.classList.toggle("is-input-focused", isFocused);
  applyCommentSheetFocusProgress(isFocused ? 1 : 0);
}

function setupCommentSheetDragInteractions() {
  const sheet = document.getElementById("commentSheet");
  const input = document.getElementById("commentInput");
  if (!sheet || !input) return;

  let dragState = null;
  const mouseDragId = "mouse";
  const shouldIgnoreDragTarget = (target) => Boolean(
    target?.closest?.(".comment-submit-btn, .close-btn, button, [data-comment-action], .more-menu"),
  );

  const beginDrag = (clientY, pointerId, target) => {
    if (!sheet.classList.contains("open")) return false;
    if (shouldIgnoreDragTarget(target)) return false;
    const startProgress = sheet.classList.contains("is-input-focused") ? 1 : 0;
    dragState = {
      pointerId,
      startY: clientY,
      startProgress,
      currentProgress: startProgress,
    };
    setCommentSheetDragging(true);
    return true;
  };

  const updateDrag = (clientY, event) => {
    if (!dragState) return;
    const dragDistance = Math.max(0, clientY - dragState.startY);
    if (dragDistance < 2) return;
    event?.preventDefault?.();
    const nextProgress = clampCommentSheetProgress(
      dragState.startProgress - dragDistance / COMMENT_SHEET_DRAG_RANGE_PX,
    );
    dragState.currentProgress = nextProgress;
    applyCommentSheetFocusProgress(nextProgress, dragDistance);
    if (dragDistance > 24 && document.activeElement === input) input.blur();
  };

  const finishDragAt = (clientY) => {
    if (!dragState) return;
    const dragDistance = Math.max(0, clientY - dragState.startY);
    const shouldStayFocused = dragState.startProgress > 0
      && dragDistance < COMMENT_SHEET_DRAG_SETTLE_PX
      && dragState.currentProgress > 0.68;
    dragState = null;
    setCommentSheetDragging(false);
    settleCommentSheetFocus(shouldStayFocused);
  };

  const handleMouseMove = (event) => {
    if (!dragState || dragState.pointerId !== mouseDragId) return;
    updateDrag(event.clientY, event);
  };

  const handleMouseUp = (event) => {
    if (!dragState || dragState.pointerId !== mouseDragId) return;
    document.removeEventListener("mousemove", handleMouseMove);
    finishDragAt(event.clientY);
  };

  const startPointerDrag = (event) => {
    if (dragState) return;
    const isMousePointer = event.pointerType === "mouse";
    const dragId = isMousePointer ? mouseDragId : event.pointerId;
    if (!beginDrag(event.clientY, dragId, event.target)) return;
    if (isMousePointer) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp, { once: true });
      return;
    }
    try {
      sheet.setPointerCapture?.(event.pointerId);
    } catch {
      // Some synthetic or browser-specific pointer streams cannot be captured.
    }
  };

  const startMouseDrag = (event) => {
    if (event.button !== 0 || dragState) return;
    if (!beginDrag(event.clientY, mouseDragId, event.target)) return;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp, { once: true });
  };

  const dragStartTargets = [sheet, input, input.closest(".comment-input-area")]
    .filter((target, index, targets) => target && targets.indexOf(target) === index);
  dragStartTargets.forEach((target) => {
    target.addEventListener("pointerdown", startPointerDrag);
    target.addEventListener("mousedown", startMouseDrag);
  });

  sheet.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    updateDrag(event.clientY, event);
  });

  const finishPointerDrag = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    try {
      sheet.releasePointerCapture?.(event.pointerId);
    } catch {
      // Ignore release failures for uncaptured pointer streams.
    }
    finishDragAt(event.clientY);
  };

  sheet.addEventListener("pointerup", finishPointerDrag);
  sheet.addEventListener("pointercancel", finishPointerDrag);
}

function setupCommentSheetOutsideDismiss() {
  document.addEventListener("click", (event) => {
    const sheet = document.getElementById("commentSheet");
    if (!sheet?.classList.contains("open")) return;
    if (sheet.contains(event.target)) return;
    if (event.target.closest?.('[data-post-action="comment"]')) return;
    closeSheet("commentSheet");
  });
}

function setupCommentInputFocusState() {
  const input = document.getElementById("commentInput");
  if (!input) return;

  input.addEventListener("focus", () => {
    if (isCommentSheetDragging) return;
    settleCommentSheetFocus(true);
    requestAnimationFrame(() => {
      document.getElementById("commentList")?.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
  input.addEventListener("blur", () => {
    if (!isCommentSheetDragging) settleCommentSheetFocus(false);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitComment();
    }
  });
  input.addEventListener("input", syncCommentMentionChipFromText);
  input.addEventListener("click", (event) => {
    const removeButton = event.target.closest?.(".comment-mention-remove");
    if (!removeButton) return;
    event.preventDefault();
    event.stopPropagation();
    removeCommentMentionChip(input);
    input.focus();
  });
  setupCommentSheetDragInteractions();
}

function isReplyCommentContent(content) {
  return /^@[^\s@]+\s+[\s\S]*$/.test(String(content ?? ""));
}

function getCommentCreatedAtMs(comment) {
  const createdAtMs = new Date(comment?.created_at || 0).getTime();
  return Number.isFinite(createdAtMs) ? createdAtMs : 0;
}

function orderCommentsForDisplay(comments) {
  const visibleComments = Array.isArray(comments) ? comments : [];
  const repliesByOldest = visibleComments
    .filter((comment) => isReplyCommentContent(comment.content))
    .sort((left, right) => {
      const createdAtDelta =
        getCommentCreatedAtMs(left) - getCommentCreatedAtMs(right);
      if (createdAtDelta !== 0) return createdAtDelta;
      return String(left.id || "").localeCompare(String(right.id || ""));
    });
  let replyIndex = 0;
  return visibleComments.map((comment) =>
    isReplyCommentContent(comment.content)
      ? repliesByOldest[replyIndex++]
      : comment,
  );
}

function createCommentElement(comment, postOwnerId = null) {
  let authorNickname = String(comment.user_email || "익명");
  if (authorNickname.includes("@")) {
    authorNickname = authorNickname.split("@")[0];
  }

  const item = document.createElement("div");
  item.className = "comment-item";
  item.innerHTML = `
    <button class="comment-avatar" type="button" aria-label="댓글 작성자 프로필 보기">
      <img src="image/glimmer-profile-image.png" alt="" />
    </button>
    <div class="comment-main">
      <div class="comment-meta">
        <button class="comment-author" type="button"></button>
        <span class="comment-time"></span>
      </div>
      <div class="comment-reply-context"></div>
      <div class="comment-text"></div>
      <button class="comment-reply-btn" type="button">답글 달기</button>
    </div>
    <div class="comment-actions">
      <div class="comment-action-btn comment-more-wrapper" data-comment-action="more">
        <span class="material-symbols-outlined">more_horiz</span>
        <div class="more-menu comment-more-menu"></div>
      </div>
      <div class="comment-action-btn" data-comment-action="like">
        <span class="material-symbols-outlined icon-like">favorite</span>
        <span class="action-count"></span>
      </div>
    </div>`;

  const avatarButton = item.querySelector(".comment-avatar");
  const avatarImage = avatarButton.querySelector("img");
  const authorButton = item.querySelector(".comment-author");
  const authorProfile = comment.author_profile || null;
  const authorId = comment.user_id || authorProfile?.id || "";
  const profileNickname = String(authorProfile?.nickname || "").trim();
  if (profileNickname) authorNickname = profileNickname;

  const commentContent = String(comment.content ?? "");
  const replyPrefixMatch = commentContent.match(/^@([^\s@]+)\s+([\s\S]*)$/);
  const replyTargetNickname = replyPrefixMatch ? replyPrefixMatch[1] : "";
  const commentBody = replyPrefixMatch ? replyPrefixMatch[2] : commentContent;

  authorButton.textContent = authorNickname;
  item.querySelector(".comment-time").textContent = comment.created_at
    ? timeForToday(comment.created_at)
    : "";
  if (replyTargetNickname) {
    item.classList.add("is-reply-comment");
    item.querySelector(".comment-reply-context").textContent = "답글 · @" + replyTargetNickname;
  }
  item.querySelector(".comment-text").textContent = commentBody;

  const avatarUrl = String(authorProfile?.avatar_url || "").trim()
    || "image/glimmer-profile-image.png";
  avatarImage.src = avatarUrl;
  avatarImage.addEventListener("error", () => {
    if (avatarImage.dataset.defaultFallback === "true") return;
    avatarImage.dataset.defaultFallback = "true";
    avatarImage.src = "image/glimmer-profile-image.png";
  });

  if (authorId) {
    const openAuthorProfile = (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeSheet("commentSheet");
      openUserProfile(authorId);
    };
    avatarButton.addEventListener("click", openAuthorProfile);
    authorButton.addEventListener("click", openAuthorProfile);
  } else {
    avatarButton.disabled = true;
    authorButton.disabled = true;
  }

  const replyButton = item.querySelector(".comment-reply-btn");
  replyButton.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  replyButton.addEventListener("click", (event) => {
    event.preventDefault();
    setCommentReplyTarget(comment.id, authorNickname);
  });

  const hasLiked = likedCommentIds.has(comment.id);
  const likeButton = item.querySelector('[data-comment-action="like"]');
  const likeIcon = likeButton.querySelector(".icon-like");
  likeIcon.style.fontVariationSettings = hasLiked ? "'FILL' 1" : "'FILL' 0";
  likeIcon.style.color = hasLiked ? "#ff3b30" : "#666";
  likeButton.querySelector(".action-count").textContent = formatEngagementCount(comment.likes_count);
  likeButton.addEventListener("click", () =>
    toggleCommentLike(comment.id, likeButton),
  );

  const moreButton = item.querySelector('[data-comment-action="more"]');
  const moreMenu = moreButton.querySelector(".comment-more-menu");
  const isOwnComment = currentUser?.id === comment.user_id;
  const canDeleteComment =
    Boolean(currentUser?.id) &&
    (isOwnComment || currentUser.id === postOwnerId);
  const menuItems = [
    {
      label: "신고",
      icon: "report",
      action: () => reportComment(comment.id),
    },
  ];
  if (canDeleteComment) {
    menuItems.push({
      label: "삭제",
      icon: "delete",
      className: "danger",
      action: () => deleteComment(comment.id),
    });
  }

  if (menuItems.length === 0) {
    moreButton.remove();
  } else {
    moreMenu.textContent = "";
    moreMenu.append(
      ...menuItems.map(({ label, icon, className, action }) => {
        const button = document.createElement("button");
        const iconElement = document.createElement("span");
        const labelElement = document.createElement("span");
        button.className = `more-menu-item${className ? ` ${className}` : ""}`;
        button.type = "button";
        iconElement.className = "material-symbols-outlined comment-menu-icon";
        iconElement.textContent = icon;
        labelElement.textContent = label;
        button.append(iconElement, labelElement);
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          moreMenu.classList.remove("show");
          action();
        });
        return button;
      }),
    );
    moreButton.addEventListener("click", (event) =>
      toggleMoreMenu(moreButton, event),
    );
  }
  return item;
}

async function fetchComments(postId) {
  const list = document.getElementById("commentList");
  list.innerHTML =
    '<div style="text-align:center; color:#555; margin-top:20px;">댓글을 가져오는 중...</div>';
  const [{ data, error }, postResult] = await Promise.all([
    runVisibleContentQuery(
      () =>
        client
          .from("comments")
          .select("*")
          .eq("post_id", postId)
          .order("likes_count", { ascending: false })
          .order("created_at", { ascending: false }),
      "comments-load",
    ),
    runVisibleContentQuery(
      () => client
        .from("posts")
        .select("user_id")
        .eq("id", postId),
      "comments-post-owner-load",
      (query) => query.single(),
    ),
  ]);

  if (error) return (list.innerHTML = "오류 발생");
  if (postResult.error) {
    reportClientDiagnostic("comments-post-owner-load", postResult.error);
  }
  const visibleComments = filterBlockedComments(data);
  if (visibleComments.length === 0)
    return (list.innerHTML =
      '<div style="text-align:center; color:#555; margin-top:20px;">첫 번째로 댓글을 남겨 보세요.</div>');

  const commentAuthorIds = [
    ...new Set(visibleComments.map((comment) => comment.user_id).filter(Boolean)),
  ];
  const authorProfilesById = new Map();
  if (commentAuthorIds.length > 0) {
    const { data: authorProfiles, error: authorProfilesError } =
      await runVisibleContentQuery(
        () => client
          .from("profiles")
          .select("id, nickname, avatar_url")
          .in("id", commentAuthorIds),
        "comments-author-profiles-load",
      );
    if (authorProfilesError) {
      reportClientDiagnostic(
        "comments-author-profiles-load",
        authorProfilesError,
      );
    } else {
      (authorProfiles || []).forEach((profile) => {
        authorProfilesById.set(profile.id, profile);
      });
    }
  }

  const postOwnerId = postResult.data?.user_id || null;
  const orderedComments = orderCommentsForDisplay(visibleComments);
  list.replaceChildren(
    ...orderedComments.map((comment) =>
      createCommentElement(
        {
          ...comment,
          author_profile: authorProfilesById.get(comment.user_id) || null,
        },
        postOwnerId,
      ),
    ),
  );
  list.scrollTop = 0;
}

function deleteComment(commentId) {
  if (!currentUser) {
    showAppAlert("댓글을 삭제하려면 로그인이 필요합니다.");
    return;
  }

  showAppConfirm(
    "삭제한 댓글은 되돌릴 수 없습니다.\n정말 삭제하시겠습니까?",
    () => submitCommentDelete(commentId),
    {
      title: "댓글 삭제",
      icon: "delete",
      confirmText: "삭제",
      isDestructive: true,
    },
  );
}

async function submitCommentDelete(commentId) {
  if (!currentUser || !currentPostIdForComment) return;

  const postId = currentPostIdForComment;
  const { count, error } = await client
    .from("comments")
    .delete({ count: "exact" })
    .eq("id", commentId)
    .eq("post_id", postId);

  if (error || count === 0) {
    if (error) reportClientDiagnostic("comment-delete", error);
    showAppAlert("댓글을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.");
    return;
  }

  likedCommentIds.delete(commentId);
  localStorage.removeItem(`comment_liked_${currentUser.id}_${commentId}`);
  fetchComments(postId);
  // Keep the comment sheet anchored; refetching the feed replaces its source post.
}

async function toggleCommentLike(commentId, element) {
  if (!currentUser) return alert("좋아요를 누르려면 로그인이 필요합니다.");
  if (element.dataset.pending === "true") return;
  const countSpan = element.querySelector(".action-count");
  const icon = element.querySelector(".icon-like");
  element.dataset.pending = "true";

  const { data, error } = await client.rpc("toggle_comment_like", {
    target_comment_id: commentId,
  });
  delete element.dataset.pending;
  if (error) {
    showAppAlert(
      getContentSubmissionErrorMessage(
        error,
        "댓글 좋아요를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
      ),
    );
    return;
  }

  const result = Array.isArray(data) ? data[0] : data;
  const isLiked = Boolean(result?.liked);
  if (isLiked) likedCommentIds.add(commentId);
  else likedCommentIds.delete(commentId);
  countSpan.innerText = formatEngagementCount(result?.total_count);
  icon.style.fontVariationSettings = isLiked ? "'FILL' 1" : "'FILL' 0";
  icon.style.color = isLiked ? "#ff3b30" : "#666";
  localStorage.removeItem(`comment_liked_${currentUser.id}_${commentId}`);
  if (currentPostIdForComment) void fetchComments(currentPostIdForComment);
}

function getReportTargetLabel(targetType) {
  return {
    post: "게시글",
    comment: "댓글",
    user: "사용자",
  }[targetType] || "콘텐츠";
}

function openReportSheet(targetType, targetId) {
  if (!currentUser) {
    showAppAlert("신고하려면 로그인이 필요합니다.", () => {
      switchTab("profile");
    });
    return;
  }
  if (!targetId || !["post", "comment", "user"].includes(targetType)) return;
  if (targetType === "user" && targetId === currentUser.id) {
    showAppAlert("본인은 신고할 수 없습니다.");
    return;
  }

  pendingReportTarget = { type: targetType, id: targetId };
  document
    .querySelectorAll('input[name="reportReason"]')
    .forEach((input) => {
      input.checked = false;
    });
  document.getElementById("reportDetails").value = "";
  document.getElementById("reportTargetLabel").textContent =
    `${getReportTargetLabel(targetType)} 신고`;
  document
    .querySelectorAll(".more-menu")
    .forEach((menu) => menu.classList.remove("show"));
  openSheet("reportSheet");
}

function closeReportSheet() {
  closeSheet("reportSheet");
  pendingReportTarget = null;
}

function getReportErrorMessage(error) {
  const message = String(error?.message || "").toLowerCase();
  if (error?.code === "23505" || message.includes("already submitted")) {
    return "이미 접수되어 검토 중인 신고입니다.";
  }
  if (message.includes("rate limit")) {
    return "신고 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
  }
  if (message.includes("yourself")) {
    return "본인이 작성한 콘텐츠는 신고할 수 없습니다.";
  }
  if (message.includes("not found")) {
    return "삭제되었거나 더 이상 신고할 수 없는 대상입니다.";
  }
  return "신고를 접수하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

function getContentSubmissionErrorMessage(error, fallbackMessage) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("ugc policy acceptance required")) {
    return "최신 이용약관과 커뮤니티 기준에 동의한 뒤 작성할 수 있습니다.";
  }
  if (message.includes("content violates community standards")) {
    return "커뮤니티 기준에 맞지 않는 내용은 등록할 수 없습니다.";
  }
  if (message.includes("content length is not allowed")) {
    return "글 또는 댓글 길이가 허용 범위를 벗어났습니다.";
  }
  if (message.includes("account is banned")) {
    return "운영 정책 위반으로 글과 댓글 작성이 제한된 계정입니다.";
  }
  if (message.includes("account is suspended")) {
    return "현재 계정의 글과 댓글 작성이 일시적으로 제한되어 있습니다.";
  }
  return fallbackMessage;
}

function getUgcPolicyAgreementMessage() {
  return "글림 가입 및 글/댓글 작성을 위해 최신 이용약관과 커뮤니티 기준에 동의해야 합니다. 신고·차단·운영자 검토 정책을 확인했고 이에 동의하시겠습니까?";
}

function requestUgcPolicyAgreement() {
  return showAppConfirmAsync(getUgcPolicyAgreementMessage(), {
    title: "약관 및 커뮤니티 기준 동의",
    icon: "policy",
    confirmText: "동의",
  });
}

function markPendingUgcPolicyAcceptanceAfterOAuth() {
  localStorage.setItem(PENDING_UGC_POLICY_ACCEPTANCE_STORAGE_KEY, "1");
}

function clearPendingUgcPolicyAcceptanceAfterOAuth() {
  localStorage.removeItem(PENDING_UGC_POLICY_ACCEPTANCE_STORAGE_KEY);
}

function hasPendingUgcPolicyAcceptanceAfterOAuth() {
  return localStorage.getItem(PENDING_UGC_POLICY_ACCEPTANCE_STORAGE_KEY) === "1";
}

function markUgcPolicyLoginConsentSeen() {
  localStorage.setItem(UGC_POLICY_LOGIN_CONSENT_SEEN_STORAGE_KEY, "1");
}

function hasSeenUgcPolicyLoginConsent() {
  return localStorage.getItem(UGC_POLICY_LOGIN_CONSENT_SEEN_STORAGE_KEY) === "1";
}

async function acceptPendingUgcPolicyAfterAuth() {
  if (!currentUser || !hasPendingUgcPolicyAcceptanceAfterOAuth()) return false;

  const { error } = await client.rpc("accept_current_ugc_policy", {
    acceptance_source: "client",
  });
  if (error) {
    reportClientDiagnostic("ugc-policy-post-auth-accept", error);
    showAppAlert("동의 상태를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
    return false;
  }

  clearPendingUgcPolicyAcceptanceAfterOAuth();
  markUgcPolicyLoginConsentSeen();
  return true;
}

async function promptForUgcPolicyAcceptanceAfterSignIn() {
  if (!currentUser) return;
  if (await acceptPendingUgcPolicyAfterAuth()) return;
  if (promptedUgcPolicyUserId === currentUser.id) return;

  const { data, error } = await client.rpc("get_ugc_policy_acceptance_status");
  if (error) {
    reportClientDiagnostic("ugc-policy-post-auth-status", error);
    return;
  }
  if (data?.[0]?.accepted) {
    markUgcPolicyLoginConsentSeen();
    return;
  }

  promptedUgcPolicyUserId = currentUser.id;
  if (!(await requestUgcPolicyAgreement())) return;

  markPendingUgcPolicyAcceptanceAfterOAuth();
  await acceptPendingUgcPolicyAfterAuth();
}

async function ensureCurrentUgcPolicyAccepted() {
  const { data, error } = await client.rpc("get_ugc_policy_acceptance_status");
  if (error) {
    reportClientDiagnostic("ugc-policy-status", error);
    showAppAlert(
      "이용약관 동의 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.",
    );
    return false;
  }

  if (data?.[0]?.accepted) return true;

  const agreed = await requestUgcPolicyAgreement();
  if (!agreed) {
    showAppAlert("동의 후 글과 댓글을 작성할 수 있습니다.");
    return false;
  }

  const { error: acceptError } = await client.rpc("accept_current_ugc_policy", {
    acceptance_source: "client",
  });
  if (acceptError) {
    reportClientDiagnostic("ugc-policy-accept", acceptError);
    showAppAlert("동의 상태를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
    return false;
  }
  markUgcPolicyLoginConsentSeen();
  return true;
}

async function submitReport() {
  if (!currentUser || !pendingReportTarget) return;
  const selectedReason = document.querySelector(
    'input[name="reportReason"]:checked',
  );
  if (!selectedReason || !REPORT_REASON_LABELS[selectedReason.value]) {
    showAppAlert("신고 사유를 선택해주세요.");
    return;
  }

  const submitButton = document.getElementById("reportSubmitButton");
  const details = document.getElementById("reportDetails").value.trim();
  const reportTarget = { ...pendingReportTarget };
  submitButton.disabled = true;
  submitButton.textContent = "접수 중...";

  const { error } = await client.rpc("submit_content_report", {
    report_target_type: reportTarget.type,
    report_target_id: reportTarget.id,
    report_reason: selectedReason.value,
    report_details: details,
  });

  submitButton.disabled = false;
  submitButton.textContent = "신고 접수";
  if (error) {
    showAppAlert(getReportErrorMessage(error));
    return;
  }

  closeReportSheet();
  showAppAlert("신고가 접수되었습니다. 관리자 검토 후 조치됩니다.");
}

function reportComment(commentId) {
  openReportSheet("comment", commentId);
}

function reportUser(userId) {
  openReportSheet("user", userId);
}

async function submitComment() {
  if (!currentUser) {
    alert("댓글을 남기려면 로그인이 필요합니다.");
    closeSheet("commentSheet");
    switchTab("profile");
    return;
  }
  if (!(await ensureCurrentUgcPolicyAccepted())) return;
  const content = getCommentInputContent();
  if (!content) return;

  // RLS는 profiles.nickname을 작성자 계약으로 검증하므로 DB 기준 닉네임을 사용합니다.
  const myNickname = getCurrentAuthorNickname();

  const { error } = await client.from("comments").insert([
    {
      post_id: currentPostIdForComment,
      user_id: currentUser.id,
      user_email: myNickname,
      content: content,
    },
  ]);

  if (!error) {
    clearCommentInputContent();
    fetchComments(currentPostIdForComment);

    const { data: postData } = await runVisibleContentQuery(
      () =>
        client
          .from("posts")
          .select("author, user_id")
          .eq("id", currentPostIdForComment),
      "comment-post-load",
      (query) => query.single(),
    );

    if (postData?.user_id && postData.user_id !== currentUser.id) {
      const notificationPayload = {
        target_user: postData.author,
        target_user_id: postData.user_id,
        actor_nickname: myNickname,
        actor_user_id: currentUser.id,
        type: "comment",
        post_id: currentPostIdForComment,
        preview_text: content.slice(0, 100),
      };
      let { error: notificationError } = await client
        .from("notifications")
        .insert([notificationPayload]);
      if (notificationError?.code === "PGRST204") {
        delete notificationPayload.preview_text;
        ({ error: notificationError } = await client
          .from("notifications")
          .insert([notificationPayload]));
      }
      if (notificationError) {
        reportClientDiagnostic("comment-notification-save", notificationError);
      }
      void sendPushNotification(
        postData.user_id,
        "comments",
        currentPostIdForComment,
      );
    }

    fetchPosts();
  } else {
    showAppAlert(
      getContentSubmissionErrorMessage(
        error,
        "댓글을 등록하지 못했습니다. 잠시 후 다시 시도해주세요.",
      ),
    );
  }
}

function renderNotificationState(icon, title, description = "") {
  return `
    <div class="noti-state">
      <span class="material-symbols-outlined noti-state-icon">${escapeHtml(icon)}</span>
      <div class="noti-state-title">${escapeHtml(title)}</div>
      ${
        description
          ? `<div class="noti-state-desc">${escapeHtml(description)}</div>`
          : ""
      }
    </div>
  `;
}

function getAnnouncementNotificationTitle(content) {
  const value = String(content ?? "").trim();
  if (!value) return "글림의 새로운 소식";

  const withoutPrefix = value.replace(/^\[공지\]\s*/, "");
  const titleCandidate = withoutPrefix.includes("|||")
    ? withoutPrefix.split("|||")[0]
    : withoutPrefix.split(/\r?\n/).find((line) => line.trim());
  const title = String(titleCandidate || "").trim();
  return title ? title.slice(0, 70) : "글림의 새로운 소식";
}

async function openNotificationPost(postId, notificationType = "") {
  if (!postId) return;
  const { data: post, error } = await runVisibleContentQuery(
    () =>
      client
        .from("posts")
        .select("*")
        .eq("id", postId),
    "notification-post-load",
    (query) => query.maybeSingle(),
  );
  if (error || !post) {
    showAppAlert("삭제되었거나 더 이상 볼 수 없는 글입니다.");
    return;
  }
  if (
    blockedUserIds.has(post.user_id) ||
    blockedUserNicknames.has(post.author || "")
  ) {
    showAppAlert("차단한 사용자의 글은 볼 수 없습니다.");
    return;
  }

  const contextKey = "notification-post";
  contextPostCollections.set(contextKey, [post]);
  contextPostTitles.set(contextKey, "알림에서 본 글");
  openContextPostFeed(contextKey, 0);

  if (["comment", "comments"].includes(notificationType)) {
    window.setTimeout(() => openSheet("commentSheet", post.id), 260);
  }
}

async function openNotificationTarget(element) {
  const type = element?.dataset?.notificationType || "";
  const postId = element?.dataset?.postId || "";
  const actorNickname = element?.dataset?.actorNickname || "";

  if (type === "announcement") {
    openNoticeSheet();
    return;
  }
  if (postId) {
    await openNotificationPost(postId, type);
    return;
  }
  if (type === "follow" && actorNickname) {
    const { data: profile } = await client
      .from("profiles")
      .select("id")
      .eq("nickname", actorNickname)
      .maybeSingle();
    if (profile?.id) {
      await openUserProfile(profile.id);
    } else {
      showAppAlert("사용자 프로필을 찾을 수 없습니다.");
    }
  }
}

async function handleNotificationDeepLink() {
  const url = new URL(window.location.href);
  const postId = url.searchParams.get("notificationPost") || "";
  const notificationType = url.searchParams.get("notificationType") || "";
  const tab = url.searchParams.get("tab") || "";
  if (!postId && tab !== "noti") return;

  url.searchParams.delete("notificationPost");
  url.searchParams.delete("notificationType");
  url.searchParams.delete("tab");
  window.history.replaceState(
    {},
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );

  if (postId) {
    await openNotificationPost(postId, notificationType);
  } else if (tab === "noti") {
    switchTab("noti");
  }
}

async function fetchNotifications() {
  const notiList = document.getElementById("notiList");
  if (!notiList) return;

  if (!currentUser) {
    notiList.innerHTML = renderNotificationState(
      "notifications",
      "로그인이 필요합니다.",
      "프로필에서 로그인하면 알림을 확인할 수 있어요.",
    );
    return;
  }

  notiList.innerHTML = renderNotificationState(
    "hourglass_empty",
    "알림을 불러오는 중...",
  );
  const preferences = getNotificationPreferences();
  const [notificationResult, announcementResult] = await Promise.all([
    client
      .from("notifications")
      .select("*")
      .eq("target_user_id", currentUser.id)
      .order("created_at", { ascending: false }),
    preferences.announcements
      ? runVisibleContentQuery(
          () =>
            client
              .from("posts")
              .select("id, content, created_at")
              .eq("author", "🚨글림 운영자")
              .order("created_at", { ascending: false })
              .limit(10),
          "announcement-posts-load",
        )
      : Promise.resolve({ data: [], error: null }),
  ]);
  const { data, error } = notificationResult;

  if (error)
    return (notiList.innerHTML = renderNotificationState(
      "error",
      "오류가 발생했습니다.",
      "잠시 후 다시 확인해주세요.",
    ));
  if (announcementResult.error) {
    reportClientDiagnostic("announcement-load", announcementResult.error);
  }

  const announcementNotifications = (announcementResult.data || []).map(
    (post) => ({
      id: `announcement-${post.id}`,
      type: "announcement",
      actor_nickname: "글림 운영팀",
      announcement_title: getAnnouncementNotificationTitle(post.content),
      created_at: post.created_at,
    }),
  );
  const unblockedNotifications = [
    ...(data || []),
    ...announcementNotifications,
  ]
    .filter(
      (notification) =>
        notification.type === "announcement" ||
        !blockedUserNicknames.has(notification.actor_nickname || ""),
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  const visibleNotifications = unblockedNotifications.filter((notification) =>
    isNotificationTypeEnabled(notification.type, preferences),
  );
  if (!visibleNotifications.length && unblockedNotifications.length)
    return (notiList.innerHTML = renderNotificationState(
      "notifications_off",
      "선택한 알림이 없습니다.",
      "알림 설정에서 받고 싶은 소식을 켜보세요.",
    ));
  if (!visibleNotifications.length)
    return (notiList.innerHTML = renderNotificationState(
      "notifications_off",
      "새로운 알림이 없습니다.",
      "조용한 새벽처럼 아직 도착한 소식이 없어요.",
    ));

  notiList.innerHTML = visibleNotifications
    .map((n) => {
      let icon = "notifications";
      let iconClass = "";
      let text = "";
      let preview = "";
      const actor = escapeHtml(n.actor_nickname || "누군가");

      if (n.type === "like") {
        icon = "favorite";
        iconClass = "like";
        text = `<strong>${actor}</strong>님의 마음이 회원님의 글에 머물렀습니다.`;
      } else if (n.type === "comment") {
        icon = "chat_bubble";
        iconClass = "comment";
        text = `<strong>${actor}</strong>님이 회원님의 글에 생각을 남겼습니다.`;
        if (n.preview_text) {
          preview = `<div class="noti-preview">“${escapeHtml(n.preview_text)}”</div>`;
        }
      } else if (n.type === "follow") {
        icon = "person_add";
        iconClass = "follow";
        text = `<strong>${actor}</strong>님이 회원님의 글 흐름을 구독하기 시작했습니다.`;
      } else if (n.type === "announcement") {
        icon = "campaign";
        iconClass = "announcement";
        text = `<strong>글림</strong> · ${escapeHtml(n.announcement_title)}`;
      } else {
        text = "새로운 알림이 도착했습니다.";
      }
      const isActionable = Boolean(
        n.type === "announcement" || n.post_id || n.type === "follow",
      );
      const itemClass = `noti-item${isActionable ? " is-actionable" : ""}`;
      const itemAttributes = isActionable
        ? `role="button" tabindex="0" data-notification-type="${escapeHtml(n.type || "")}" data-post-id="${escapeHtml(n.post_id || "")}" data-actor-nickname="${escapeHtml(n.actor_nickname || "")}" data-glim-click="open-notification-target" data-glim-keydown="open-notification-target"`
        : `role="listitem"`;

      return `
      <div class="${itemClass}" ${itemAttributes}>
        <span class="material-symbols-outlined noti-icon ${iconClass}">${escapeHtml(icon)}</span>
        <div class="noti-content">
          <div class="noti-text">${text}</div>
          ${preview}
          <div class="noti-time">${timeForToday(n.created_at)}</div>
        </div>
      </div>
    `;
    })
    .join("");
}

async function submitPost() {
  if (!currentUser) {
    showAppAlert("글을 작성하려면 로그인이 필요합니다.", () => {
      switchTab("profile");
    });
    return;
  }
  if (!(await ensureCurrentUgcPolicyAccepted())) return;
  const content = document.getElementById("postContent").value.trim();
  const bgmUrl = document.getElementById("postBgm").value;
  const mood = document.getElementById("postMood").value; // ✅ 감성 태그 값 가져오기

  const selectedBgmTrack = getBgmTrackByUrl(bgmUrl);
  const bgmTitle = selectedBgmTrack?.title || null;

  if (!content || content.length < POST_MIN_CHARACTERS)
    return alert(`최소 ${POST_MIN_CHARACTERS}자 이상 작성해주세요.`);
  if (
    content.length > POST_MAX_CHARACTERS ||
    getPostVisualLineCount(content) > POST_MAX_VISUAL_LINES
  ) {
    return alert(
      `글림의 글은 ${POST_MAX_CHARACTERS}자, 한 화면 ${POST_MAX_VISUAL_LINES}줄 이내로 작성해주세요.`,
    );
  }
  if (!mood) return alert("글의 감성 온도를 선택해주세요."); // ✅ 감성 선택 필수 확인

  const authorNickname = getCurrentAuthorNickname();

  const postPayload = {
    content: content,
    author: authorNickname,
    user_id: currentUser.id,
    bgm_url: bgmUrl,
    bgm_title: bgmTitle,
    mood: mood,
  };

  let { data: insertedPost, error } = await client
    .from("posts")
    .insert([postPayload])
    .select("id")
    .single();
  if (isMissingPostBgmTitleColumnError(error)) {
    reportClientDiagnostic("post-create-bgm-title-missing", error);
    const { bgm_title: _bgmTitle, ...legacyPostPayload } = postPayload;
    ({ data: insertedPost, error } = await client
      .from("posts")
      .insert([legacyPostPayload])
      .select("id")
      .single());
  }

  if (error) {
    reportClientDiagnostic("post-create", error);
    showAppAlert(
      getContentSubmissionErrorMessage(
        error,
        "글 등록 중 오류가 발생했습니다.",
      ),
    );
    return;
  }

  document.getElementById("postContent").value = "";
  document.getElementById("postBgm").value = "";
  document.getElementById("postMood").value = ""; // ✅ 태그 초기화
  updateSelectedBgmLabel();
  updateSelectedMoodLabel();
  updateCharCount();
  void requestPostAiAnalysis(insertedPost?.id);
  switchTab("home");
}

function getPostTextMeasureElement() {
  if (postTextMeasureElement) return postTextMeasureElement;

  postTextMeasureElement = document.createElement("div");
  postTextMeasureElement.className = "post-text-measure";
  postTextMeasureElement.setAttribute("aria-hidden", "true");
  document.body.appendChild(postTextMeasureElement);
  return postTextMeasureElement;
}

function getPostVisualLineCount(content) {
  if (!content) return 0;

  const measureElement = getPostTextMeasureElement();
  measureElement.innerText = content;
  return Math.max(
    1,
    Math.round(measureElement.scrollHeight / POST_REFERENCE_LINE_HEIGHT),
  );
}

function constrainPostContent(content) {
  const characters = Array.from(content).slice(0, POST_MAX_CHARACTERS);
  const candidate = characters.join("");
  if (getPostVisualLineCount(candidate) <= POST_MAX_VISUAL_LINES) {
    return candidate;
  }

  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const nextValue = characters.slice(0, middle).join("");
    if (getPostVisualLineCount(nextValue) <= POST_MAX_VISUAL_LINES) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return characters.slice(0, low).join("");
}

function setupPostContentInputHandler() {
  if (isPostContentInputHandlerReady) return;
  const input = document.getElementById("postContent");
  if (!input) return;

  input.addEventListener("input", handlePostContentInput);
  input.addEventListener("compositionend", handlePostContentInput);
  isPostContentInputHandlerReady = true;
}

function handlePostContentInput(event) {
  const input = event?.currentTarget || document.getElementById("postContent");
  if (!input) return;

  if (event?.isComposing) {
    updateCharCount();
    return;
  }

  const constrainedValue = constrainPostContent(input.value);
  const reachedVisualLimit = constrainedValue !== input.value;
  if (reachedVisualLimit) {
    const isBulkInput =
      event?.inputType === "insertFromPaste" ||
      event?.inputType === "insertFromDrop" ||
      !input.dataset.lastValidValue;
    input.value = isBulkInput
      ? constrainedValue
      : input.dataset.lastValidValue;
  } else {
    input.dataset.lastValidValue = input.value;
  }
  updateCharCount(reachedVisualLimit);
}

function updateCharCount(reachedVisualLimit = false) {
  const input = document.getElementById("postContent");
  const counter = document.getElementById("charCount");
  if (!input || !counter) return;

  const characterCount = Array.from(input.value).length;
  const lineCount = getPostVisualLineCount(input.value);
  counter.innerText = `${characterCount} / ${POST_MAX_CHARACTERS} · ${lineCount} / ${POST_MAX_VISUAL_LINES}줄`;
  counter.classList.toggle(
    "is-near-limit",
    characterCount >= POST_MAX_CHARACTERS - 20 ||
      lineCount >= POST_MAX_VISUAL_LINES - 1,
  );
  counter.classList.toggle(
    "is-limit",
    reachedVisualLimit ||
      characterCount >= POST_MAX_CHARACTERS ||
      lineCount >= POST_MAX_VISUAL_LINES,
  );

  if (
    characterCount <= POST_MAX_CHARACTERS &&
    lineCount <= POST_MAX_VISUAL_LINES
  ) {
    input.dataset.lastValidValue = input.value;
  }
}

function traceRoundedRectangle(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function wrapShareCardText(context, text, maxWidth) {
  const lines = [];
  const paragraphs = String(text).replace(/\r/g, "").split("\n");

  paragraphs.forEach((paragraph) => {
    if (!paragraph) {
      lines.push("");
      return;
    }

    let line = "";
    Array.from(paragraph).forEach((character) => {
      const candidate = line + character;
      if (line && context.measureText(candidate).width > maxWidth) {
        const lastSpace = line.lastIndexOf(" ");
        if (lastSpace > line.length * 0.45) {
          lines.push(line.slice(0, lastSpace).trimEnd());
          line = `${line.slice(lastSpace + 1)}${character}`.trimStart();
        } else {
          lines.push(line.trimEnd());
          line = character.trimStart();
        }
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line.trimEnd());
  });

  return lines;
}

function drawShareCardBackground(context, width, height, seedText) {
  context.fillStyle = "#080706";
  context.fillRect(0, 0, width, height);

  const warmGlow = context.createRadialGradient(
    width * 0.82,
    height * 0.1,
    0,
    width * 0.82,
    height * 0.1,
    width * 0.82,
  );
  warmGlow.addColorStop(0, "rgba(244, 126, 63, 0.24)");
  warmGlow.addColorStop(0.45, "rgba(117, 56, 30, 0.09)");
  warmGlow.addColorStop(1, "rgba(8, 7, 6, 0)");
  context.fillStyle = warmGlow;
  context.fillRect(0, 0, width, height);

  const lowerGlow = context.createRadialGradient(
    width * 0.12,
    height * 0.88,
    0,
    width * 0.12,
    height * 0.88,
    width * 0.9,
  );
  lowerGlow.addColorStop(0, "rgba(107, 70, 54, 0.14)");
  lowerGlow.addColorStop(1, "rgba(8, 7, 6, 0)");
  context.fillStyle = lowerGlow;
  context.fillRect(0, 0, width, height);

  let seed = Array.from(String(seedText)).reduce(
    (value, character) => (value * 31 + character.codePointAt(0)) >>> 0,
    2166136261,
  );
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  context.save();
  for (let index = 0; index < 700; index += 1) {
    const alpha = 0.012 + random() * 0.025;
    context.fillStyle = `rgba(255, 241, 226, ${alpha})`;
    context.fillRect(random() * width, random() * height, 1.2, 1.2);
  }
  context.restore();
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("이미지를 만들지 못했습니다."));
    }, "image/png");
  });
}

async function createPostShareImage(post) {
  await document.fonts?.ready;

  const canvas = document.createElement("canvas");
  const width = 1080;
  const height = 1920;
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("이미지 캔버스를 열 수 없습니다.");

  const content = String(post.content || "").trim();
  const author = String(post.author || "익명");
  const mood = getMoodOption(post.mood);
  drawShareCardBackground(context, width, height, content);

  traceRoundedRectangle(context, 72, 72, 936, 1776, 52);
  context.fillStyle = "rgba(17, 15, 14, 0.76)";
  context.fill();
  context.strokeStyle = "rgba(255, 255, 255, 0.13)";
  context.lineWidth = 2;
  context.stroke();

  context.textBaseline = "middle";
  context.textAlign = "left";
  context.fillStyle = "#f4eee9";
  context.font = '700 48px "Noto Serif KR", serif';
  context.fillText("글림", 142, 178);

  context.fillStyle = "rgba(255, 255, 255, 0.42)";
  context.font = '600 20px -apple-system, sans-serif';
  context.fillText("A MOMENT THAT STAYS", 272, 181);

  const moodLabel = mood?.label || "오늘의 문장";
  context.font = '700 24px -apple-system, sans-serif';
  const moodPillWidth = context.measureText(moodLabel).width + 52;
  traceRoundedRectangle(context, 142, 250, moodPillWidth, 52, 26);
  context.fillStyle = "rgba(255, 145, 88, 0.13)";
  context.fill();
  context.strokeStyle = "rgba(255, 168, 118, 0.35)";
  context.lineWidth = 1.5;
  context.stroke();
  context.fillStyle = "#ffc09d";
  context.textAlign = "center";
  context.fillText(moodLabel, 142 + moodPillWidth / 2, 277);

  const contentLength = Array.from(content).length;
  let fontSize = contentLength <= 38 ? 76 : contentLength <= 78 ? 64 : 54;
  let lines = [];
  let lineHeight = fontSize * 1.62;
  do {
    context.font = `400 ${fontSize}px "Noto Serif KR", serif`;
    lines = wrapShareCardText(context, content, 760);
    lineHeight = fontSize * 1.62;
    if (lines.length * lineHeight <= 900) break;
    fontSize -= 2;
  } while (fontSize > 42);

  const textHeight = Math.max(1, lines.length) * lineHeight;
  const textStartY = 900 - textHeight / 2 + lineHeight / 2;

  context.textAlign = "left";
  context.fillStyle = "rgba(255, 176, 130, 0.42)";
  context.font = '400 132px "Noto Serif KR", serif';
  context.fillText("“", 135, Math.max(390, textStartY - 88));

  context.save();
  context.textAlign = "center";
  context.fillStyle = "#f4f0ec";
  context.font = `400 ${fontSize}px "Noto Serif KR", serif`;
  context.shadowColor = "rgba(0, 0, 0, 0.42)";
  context.shadowBlur = 18;
  lines.forEach((line, index) => {
    context.fillText(line, width / 2, textStartY + index * lineHeight);
  });
  context.restore();

  context.textAlign = "center";
  context.fillStyle = "rgba(241, 229, 220, 0.64)";
  context.font = '400 30px "Noto Serif KR", serif';
  context.fillText(`— ${author}`, width / 2, 1495);

  context.strokeStyle = "rgba(255, 255, 255, 0.12)";
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(142, 1690);
  context.lineTo(938, 1690);
  context.stroke();

  context.textAlign = "left";
  context.fillStyle = "rgba(255, 255, 255, 0.78)";
  context.font = '700 26px -apple-system, sans-serif';
  context.fillText("GLIM", 142, 1758);
  context.textAlign = "right";
  context.fillStyle = "rgba(255, 255, 255, 0.34)";
  context.font = '400 22px "Noto Serif KR", serif';
  context.fillText("마음이 머무는 문장", 938, 1758);

  return canvasToPngBlob(canvas);
}

function downloadPostShareImage(blob, fileName) {
  const imageUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = imageUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
}

async function sharePost(post, triggerElement) {
  if (!post?.content || triggerElement?.dataset.sharing === "true") return;

  const label = triggerElement?.querySelector(".action-count");
  if (triggerElement) triggerElement.dataset.sharing = "true";
  if (label) label.innerText = "제작 중";

  try {
    const blob = await createPostShareImage(post);
    const fileName = `glim-story-${Date.now()}.png`;
    const file =
      typeof File === "function"
        ? new File([blob], fileName, { type: "image/png" })
        : null;
    let canShareImage = false;

    if (file && navigator.share && navigator.canShare) {
      try {
        canShareImage = navigator.canShare({ files: [file] });
      } catch (_error) {
        canShareImage = false;
      }
    }

    if (canShareImage) {
      try {
        await navigator.share({
          title: "글림",
          text: "글림에서 발견한 문장",
          files: [file],
        });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }

    downloadPostShareImage(blob, fileName);
    showAppAlert(
      "스토리용 이미지를 저장했습니다.\n인스타그램 스토리에서 불러와 공유해보세요.",
    );
  } catch (error) {
    reportClientDiagnostic("share-image-create", error);
    showAppAlert("공유 이미지를 만들지 못했습니다. 잠시 후 다시 시도해주세요.");
  } finally {
    if (triggerElement) delete triggerElement.dataset.sharing;
    if (label) label.innerText = "공유";
  }
}

function toggleMoreMenu(element, event) {
  event.stopPropagation();
  const menu = element.querySelector(".more-menu");
  const isShowing = menu.classList.contains("show");
  document
    .querySelectorAll(".more-menu")
    .forEach((m) => m.classList.remove("show"));
  if (!isShowing) menu.classList.add("show");
}

document.addEventListener("click", () => {
  document
    .querySelectorAll(".more-menu")
    .forEach((m) => m.classList.remove("show"));
});

function reportPost(postId) {
  openReportSheet("post", postId);
}

function deletePost(postId) {
  if (!currentUser) {
    showAppAlert("글을 삭제하려면 로그인이 필요합니다.");
    return;
  }

  showAppConfirm(
    "삭제한 글은 되돌릴 수 없습니다.\n정말 삭제하시겠습니까?",
    () => submitPostDelete(postId),
    {
      title: "게시글 삭제",
      icon: "delete",
      confirmText: "삭제",
      isDestructive: true,
    },
  );
}

async function submitPostDelete(postId) {
  if (!currentUser) return;

  const { data, error } = await client
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("user_id", currentUser.id)
    .select("id");

  if (error || !data?.length) {
    showAppAlert("글을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.");
    return;
  }

  likedPostIds.delete(postId);
  bookmarkedPostIds.delete(postId);
  localStorage.removeItem(`liked_${currentUser.id}_${postId}`);
  localStorage.removeItem(`bookmarked_${currentUser.id}_${postId}`);
  contextPostCollections.forEach((posts, contextKey) => {
    contextPostCollections.set(
      contextKey,
      posts.filter((post) => post.id !== postId),
    );
  });
  document.querySelectorAll(".post").forEach((postElement) => {
    if (postElement.dataset.postId === String(postId)) {
      observer.unobserve(postElement);
      contextObserver.unobserve(postElement);
      postElement.remove();
    }
  });

  const activeView = document.querySelector(".app-view.active");
  const sourceViewId =
    activeView?.id === "view-context-feed"
      ? contextFeedReturnViewId
      : activeView?.id;
  if (
    activeView?.id === "view-context-feed" &&
    !document.querySelector("#contextPostFeed .post")
  ) {
    closeContextPostFeed();
  }

  showAppAlert("글이 삭제되었습니다.");

  if (sourceViewId === "view-explore") {
    await refreshExploreCurrentContent();
  } else if (sourceViewId === "view-profile") {
    await Promise.all([
      loadProfileGrid("my"),
      loadProfileGrid("bookmark"),
      loadProfileGrid("like"),
    ]);
    updateAuthUI();
  } else {
    await fetchPosts();
  }
}

async function openNoticeSheet() {
  const activeView = document.querySelector(".app-view.active");
  if (activeView?.id && activeView.id !== "view-notice-detail") {
    noticeReturnViewId = activeView.id;
  }
  openSheet("noticeSheet");
  const list = document.getElementById("noticeList");
  list.innerHTML =
    '<div style="text-align:center; color:#555; margin-top:20px;">불러오는 중...</div>';

  const { data, error } = await runVisibleContentQuery(
    () =>
      client
        .from("posts")
        .select("*")
        .eq("author", "🚨글림 운영자")
        .order("created_at", { ascending: false }),
    "notice-posts-load",
  );

  if (error)
    return (list.innerHTML =
      '<div style="text-align:center; color:#ff3b30; margin-top:20px;">오류가 발생했습니다.</div>');
  if (data.length === 0)
    return (list.innerHTML =
      '<div style="text-align:center; color:#555; margin-top:20px;">등록된 공지사항이 없습니다.</div>');

  const noticeItems = data.map((notice) => {
    let title = "공지사항";
    let text = String(notice.content ?? "");

    if (text.startsWith("[공지]")) {
      const parts = text.replace("[공지]", "").split("|||");
      if (parts.length === 2) {
        [title, text] = parts;
      } else {
        text = text.replace("[공지]\n\n", "");
      }
    }

    const dateStr = new Date(notice.created_at).toLocaleDateString();
    const item = document.createElement("div");
    item.className = "notice-list-item";
    item.style.cssText =
      "background:#111; border-radius:12px; padding:20px; margin-bottom:10px; border:1px solid #222; cursor:pointer; display:flex; justify-content:space-between; align-items:center; transition:background 0.2s;";
    item.addEventListener("click", () =>
      viewNoticeDetail(title, dateStr, text),
    );

    const titleElement = document.createElement("div");
    titleElement.className = "notice-list-item-title";
    titleElement.style.cssText =
      "color:#eee; font-size:1.05rem; font-family:'Noto Serif KR', serif; font-weight:300;";
    titleElement.textContent = title;

    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined notice-list-item-icon";
    icon.style.color = "#555";
    icon.textContent = "chevron_right";
    item.append(titleElement, icon);
    return item;
  });
  list.replaceChildren(...noticeItems);
}

function closeNoticeDetail() {
  activateAppView(noticeReturnViewId);
  openSheet("noticeSheet");
}

function viewNoticeDetail(title, date, content) {
  closeSheet("noticeSheet");
  activateAppView("view-notice-detail");

  const container = document.getElementById("noticeDetailContainer");
  const titleElement = document.createElement("div");
  titleElement.className = "notice-detail-title";
  titleElement.style.cssText =
    "color:#fff; font-weight:700; font-size:1.6rem; margin-bottom:15px; font-family:'Noto Serif KR', serif;";
  titleElement.textContent = String(title ?? "");

  const dateElement = document.createElement("div");
  dateElement.className = "notice-detail-date";
  dateElement.style.cssText =
    "color:#666; font-size:0.9rem; margin-bottom:40px; font-family:-apple-system, sans-serif; border-bottom:1px solid #222; padding-bottom:15px;";
  dateElement.textContent = String(date ?? "");

  const contentElement = document.createElement("div");
  contentElement.className = "notice-detail-content";
  contentElement.style.cssText =
    "color:#eaeaea; font-size:1.15rem; line-height:1.8; font-family:'Noto Serif KR', serif; font-weight:300; word-break:keep-all; white-space:pre-wrap;";
  contentElement.textContent = String(content ?? "");
  container.replaceChildren(titleElement, dateElement, contentElement);
}

window.setTimeout(() => hideAppSplash({ force: true }), 7000);
setupPostContentInputHandler();
init()
  .catch((error) => {
    reportClientDiagnostic("app-init", error);
  })
  .finally(() => hideAppSplash());

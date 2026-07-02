const SUPABASE_URL = "https://qdnpeliqtxdglqewbvgg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mwYlhge63nnNjL9lAFhxRw_fxRtRGvO";
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ADMIN_EMAIL = "weardockm@gmail.com";
const nativeConfirm = window.confirm.bind(window);

let currentPlayingBtn = null; // 현재 재생중인 버튼 기억
let isBgmEnabled = true;
let currentBgmUrl = "";
let bgmSyncFrame = null;
let isWaitingForBgmGesture = false;
let previewingBgmUrl = "";
let currentUser = null;
const blockedUserIds = new Set();
const blockedUserNicknames = new Set();
let currentPostIdForComment = null;
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
let exploreFetchRequestId = 0;
let exploreMoodFetchRequestId = 0;
let exploreSearchRequestId = 0;
let isExploreSearchOpen = false;
let selectedExploreMood = "사색";
let postTextMeasureElement = null;
let selectedProfileAvatarFile = null;
let shouldRemoveProfileAvatar = false;
let editAvatarPreviewObjectUrl = null;
let avatarCropSourceUrl = null;
let avatarCropOriginalFile = null;
const AVATAR_CROP_OUTPUT_SIZE = 512;
const MAX_AVATAR_SOURCE_SIZE = 15 * 1024 * 1024;
const DEFAULT_PROFILE_AVATAR_URL = "image/glimmer-profile-image.png";
const PROFILE_AVATAR_STORAGE_PATH = "/storage/v1/object/public/avatars/";
const POST_MIN_CHARACTERS = 5;
const POST_MAX_CHARACTERS = 120;
const POST_MAX_VISUAL_LINES = 12;
const POST_CENTERED_VISUAL_LINES = 8;
const POST_REFERENCE_LINE_HEIGHT = 17 * 1.65;
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
  isReady: false,
};
const contextPostCollections = new Map();
const contextPostTitles = new Map();
// --- 기존 전역 변수들 아래에 추가 ---
const postViewTimers = new Map(); // 체류 시간 측정을 위한 타이머 저장소

// 유저의 감성 취향 점수를 로컬 스토리지에 누적하는 함수
function updateMoodScore(mood, points) {
  if (!mood) return;
  let scores = JSON.parse(localStorage.getItem("glim_mood_scores") || "{}");
  scores[mood] = (scores[mood] || 0) + points;
  localStorage.setItem("glim_mood_scores", JSON.stringify(scores));
} // <--- 🌟 여기서 updateMoodScore 함수를 닫아주세요!

// 유저가 읽은 글의 ID를 로컬스토리지에 저장하는 함수
function markPostAsSeen(postId) {
  if (!postId) return;
  let seenPosts = JSON.parse(localStorage.getItem("glim_seen_posts") || "[]");

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
        } else if (viewDuration >= 3 && mood) {
          updateMoodScore(mood, 1);
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
    "view-privacy-policy",
    "view-terms-of-service",
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
            onclick="toggleBgmPreview(this.dataset.bgmUrl)"
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
            onclick="selectPostBgm(this.dataset.bgmUrl)"
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
    if (confirmed) onConfirm();
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
        onclick="selectPostMood('${escapeHtml(mood.value)}')"
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

function renderPostBgmControl(post) {
  if (!post.bgm_url) return "";
  const { title, artist } = getBgmTrackInfo(post);
  const bgmLabel = `${title} - ${artist}`;
  const shouldScroll = bgmLabel.length > 26;

  return `
      <button
        class="post-bgm-info${isBgmEnabled ? " is-enabled" : ""}"
        type="button"
        data-bgm-url="${escapeHtml(post.bgm_url)}"
        onclick="toggleBgmFromPost(this)"
      >
        <span class="material-symbols-outlined bgm-toggle-icon icon-bgm">${isBgmEnabled ? "pause" : "play_arrow"}</span>
        <span class="bgm-track">
          <span class="bgm-line${shouldScroll ? " is-marquee" : ""}">
            <span class="bgm-line-text" data-text="${escapeHtml(bgmLabel)}">${escapeHtml(bgmLabel)}</span>
          </span>
        </span>
      </button>`;
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

  if (!bgmUrl) {
    pauseBgm();
    currentBgmUrl = "";
    return;
  }

  if (currentBgmUrl !== bgmUrl) {
    bgmPlayer.src = bgmUrl;
    currentBgmUrl = bgmUrl;
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

async function init() {
  setupThemePreferences();
  setupAppAlert();
  setupBgmAudioUnlock();

  const {
    data: { session },
  } = await client.auth.getSession();
  currentUser = session?.user || null;

  if (currentUser && !currentUser.user_metadata?.random_nickname) {
    const newNick = generateRandomNickname();
    await client.auth.updateUser({ data: { random_nickname: newNick } });
    currentUser.user_metadata.random_nickname = newNick;
  }

  await syncCurrentUserProfile();
  await loadBlockedUsersState();
  updateAuthUI();
  initializePushNotifications().catch((error) => {
    console.warn("푸시 알림 초기화 실패:", error);
  });
  await fetchPosts();
  await handleNotificationDeepLink();
  schedulePushOnboarding();

  client.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    if (currentUser && !currentUser.user_metadata?.random_nickname) {
      const newNick = generateRandomNickname();
      await client.auth.updateUser({ data: { random_nickname: newNick } });
      currentUser.user_metadata.random_nickname = newNick;
    }
    await syncCurrentUserProfile();
    await loadBlockedUsersState();
    updateAuthUI();
    initializePushNotifications().catch((error) => {
      console.warn("푸시 알림 초기화 실패:", error);
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
          e.target.closest(".profile-menu-row") ||
          e.target.closest("input, textarea, button")
        )
          return;

        scrollContainer = e.target.closest(
          ".comment-list, #noticeList, #followList, .sheet-scroll",
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

function resetAllRefreshViewPositions() {
  ["home", "explore", "noti", "profile"].forEach((tabName) => {
    resetRefreshViewPosition(document.getElementById(`view-${tabName}`));
  });
}

function forceHideRefreshIndicator() {
  const indicator = document.getElementById("refreshIndicator");
  const icon = document.getElementById("refreshIndicatorIcon");
  indicator?.classList.remove("visible", "pulling", "refreshing", "complete");
  if (icon) icon.style.transform = "";
  setRefreshHeaderHidden(false);
  resetAllRefreshViewPositions();
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

    const queuePullPosition = (distance) => {
      const safeDistance = Math.max(0, distance);
      pendingPullOffset = Math.min(
        68,
        74 * (1 - Math.exp(-safeDistance / 108)),
      );
      if (pullAnimationFrame !== null) return;

      pullAnimationFrame = window.requestAnimationFrame(() => {
        pullAnimationFrame = null;
        view.style.transition = "none";
        view.style.willChange = "transform";
        view.style.transform = `translate3d(0, ${pendingPullOffset.toFixed(2)}px, 0)`;
      });
    };

    const finishPullPosition = () => {
      if (pullAnimationFrame !== null) {
        window.cancelAnimationFrame(pullAnimationFrame);
        pullAnimationFrame = null;
      }
      resetRefreshViewPosition(view);
    };

    view.addEventListener(
      "touchstart",
      (event) => {
        if (isRefreshing || view.scrollTop > 2) return;
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
        pullDistance = 0;
        isTracking = true;
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
    nickname:
      currentUser.user_metadata?.random_nickname ||
      currentUser.email.split("@")[0],
    custom_id:
      currentUser.user_metadata?.custom_id || currentUser.email.split("@")[0],
    avatar_url: normalizePersistedAvatarUrl(
      currentUser.user_metadata?.avatar_url,
    ),
    updated_at: new Date().toISOString(),
  };
}

async function syncCurrentUserProfile({ preserveStoredAvatar = true } = {}) {
  const profile = getCurrentProfileData();
  if (!profile) return;

  if (preserveStoredAvatar) {
    const { data: storedProfile, error: readError } = await client
      .from("profiles")
      .select("avatar_url")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (!readError && storedProfile) {
      profile.avatar_url = normalizePersistedAvatarUrl(
        storedProfile.avatar_url,
      );
    }
  }

  profile.avatar_url = normalizePersistedAvatarUrl(profile.avatar_url);
  currentUser.user_metadata = {
    ...currentUser.user_metadata,
    avatar_url: profile.avatar_url,
  };

  const { error } = await client.from("profiles").upsert(profile);
  if (error) console.warn("프로필 동기화 실패:", error.message);
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
    console.warn("차단 목록을 불러오지 못했습니다:", error.message);
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

function startAvatarCropDrag(event) {
  if (!avatarCropState.isReady || !event.isPrimary) return;

  event.preventDefault();
  avatarCropState.isDragging = true;
  avatarCropState.pointerId = event.pointerId;
  avatarCropState.startClientX = event.clientX;
  avatarCropState.startClientY = event.clientY;
  avatarCropState.startX = avatarCropState.x;
  avatarCropState.startY = avatarCropState.y;
  event.currentTarget.setPointerCapture(event.pointerId);
}

function moveAvatarCropDrag(event) {
  if (
    !avatarCropState.isDragging ||
    avatarCropState.pointerId !== event.pointerId
  )
    return;

  event.preventDefault();
  avatarCropState.x =
    avatarCropState.startX + event.clientX - avatarCropState.startClientX;
  avatarCropState.y =
    avatarCropState.startY + event.clientY - avatarCropState.startClientY;
  clampAvatarCropOffset();
  renderAvatarCropImage();
}

function endAvatarCropDrag(event) {
  if (avatarCropState.pointerId !== event.pointerId) return;

  avatarCropState.isDragging = false;
  avatarCropState.pointerId = null;
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
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

async function loadViewedProfileStats() {
  if (!viewedProfileUserId) return;
  contextPostCollections.set("viewed-profile", []);

  const [counts, postsResult] = await Promise.all([
    getFollowCounts(viewedProfileUserId),
    client
      .from("posts")
      .select("*")
      .eq("user_id", viewedProfileUserId)
      .order("created_at", { ascending: false }),
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
  grid.innerHTML = postsResult.data
    .map(
      (post, index) => `
        <div class="grid-item" onclick="openContextPostFeed('viewed-profile', ${index})">
          <div class="grid-text">${post.content}</div>
        </div>
      `,
    )
    .join("");
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
  button.disabled = true;

  const { data: profile, error } = await client
    .from("profiles")
    .select("id, nickname, custom_id, avatar_url")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    closeUserProfile();
    alert("사용자 프로필을 불러오지 못했습니다.");
    return;
  }

  name.innerText = profile.nickname;
  id.innerText = `@${profile.custom_id || profile.nickname}`;
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
          actor_nickname: myNickname,
          type: "follow",
        },
      ]);
    if (notificationError) {
      console.warn("앱 내부 팔로우 알림 저장 실패:", notificationError.message);
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
  adminCenterMenu.style.display =
    currentUser?.email === ADMIN_EMAIL ? "flex" : "none";
  updateSettingsAccessVisibility();

  if (currentUser) {
    authContainer.style.display = "none";
    profileContainer.style.display = "block";

    const displayName =
      currentUser.user_metadata?.random_nickname ||
      currentUser.email.split("@")[0];
    const displayId =
      currentUser.user_metadata?.custom_id || currentUser.email.split("@")[0];
    const avatarUrl = getCurrentAvatarUrl();

    document.getElementById("profileName").innerText = displayName;
    document.getElementById("profileId").innerText = `@${displayId}`;
    setOwnProfileAvatar(avatarUrl);

    client
      .from("posts")
      .select("id", { count: "exact" })
      .eq("user_id", currentUser.id)
      .then(({ count }) => {
        document.getElementById("statPosts").innerText = count || 0;
      });
    loadMyFollowStats();
  } else {
    authContainer.style.display = "block";
    profileContainer.style.display = "none";
  }
}

function openEditProfile() {
  if (!currentUser) return;
  const currentNick =
    currentUser.user_metadata?.random_nickname ||
    currentUser.email.split("@")[0];
  const currentId =
    currentUser.user_metadata?.custom_id || currentUser.email.split("@")[0];

  resetEditProfileAvatarState();
  setEditProfileAvatarPreview(getCurrentAvatarUrl());
  document.getElementById("editNicknameInput").value = currentNick;
  document.getElementById("editIdInput").value = currentId;
  openSheet("editProfileSheet");
}

async function saveProfile() {
  if (!currentUser) return;
  const newNick = document.getElementById("editNicknameInput").value.trim();
  const newId = document.getElementById("editIdInput").value.trim();
  const saveButton = document.getElementById("editProfileSaveButton");

  if (!newNick || newNick.length < 2) {
    alert("닉네임은 최소 2자 이상 입력해주세요.");
    return;
  }
  const validIdRegex = /^[a-zA-Z0-9_.]+$/;
  if (!newId || newId.length < 3 || !validIdRegex.test(newId)) {
    alert(
      "아이디는 최소 3자 이상이며, 영문/숫자/밑줄(_)/마침표(.)만 사용할 수 있습니다.",
    );
    return;
  }

  const oldNick =
    currentUser.user_metadata?.random_nickname ||
    currentUser.email.split("@")[0];

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

    await syncCurrentUserProfile({ preserveStoredAvatar: false });

    if (oldNick !== newNick) {
      await client
        .from("posts")
        .update({ author: newNick })
        .eq("user_id", currentUser.id);
      await client
        .from("comments")
        .update({ user_email: newNick })
        .eq("user_email", oldNick);
    }

    updateAuthUI();
    closeSheet("editProfileSheet");
    resetEditProfileAvatarState();
    loadProfileGrid("my");
    fetchPosts();
    alert("프로필이 성공적으로 변경되었습니다.");
  } catch (error) {
    console.warn("프로필 사진 업로드 실패:", error);
    alert(getProfileAvatarUploadErrorMessage(error));
  } finally {
    saveButton.disabled = false;
    saveButton.innerText = "저장하기";
  }
}

async function handleSocialLogin(provider) {
  const { error } = await client.auth.signInWithOAuth({
    provider: provider,
    options: { redirectTo: `${window.location.origin}/` },
  });
  if (error) {
    const providerName =
      { apple: "Apple", google: "Google", kakao: "카카오" }[provider] ||
      provider;
    showAppAlert(`${providerName} 로그인을 시작하지 못했습니다.`);
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
    !isRunningAsInstalledApp() ||
    !isPushConfigured() ||
    !isPushBrowserSupported() ||
    Notification.permission === "denied" ||
    getStoredPushFid() ||
    hasSeenPushOnboarding()
  ) {
    return;
  }

  if (document.getElementById("appAlert")?.classList.contains("open")) {
    schedulePushOnboarding(1200);
    return;
  }

  markPushOnboardingSeen();
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

async function savePushSubscription(fid, user = currentUser) {
  if (!user?.id || !fid) throw new Error("푸시 구독 정보가 없습니다.");
  const preferences = normalizeNotificationPreferences(
    user.user_metadata?.notification_preferences ||
      readStoredNotificationPreferences(),
  );
  const { error } = await client.from("push_subscriptions").upsert(
    {
      user_id: user.id,
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
}

async function removePushSubscription(fid, userId = currentUser?.id) {
  if (fid && userId) {
    const { error } = await client
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("firebase_installation_id", fid);
    if (error) console.warn("푸시 구독 삭제 실패:", error.message);
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
      console.warn("푸시 기기 정보 저장 실패:", error);
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

function updatePushNotificationSettingsUI() {
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
  if (!isPushConfigured()) {
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
  if (!isPushBrowserSupported()) {
    status.innerText = "이 브라우저에서는 지원하지 않습니다.";
    help.innerText = "HTTPS 주소 또는 설치된 글림 앱에서 다시 확인해주세요.";
    help.dataset.state = "warning";
    return;
  }
  if (Notification.permission === "denied") {
    status.innerText = "브라우저에서 알림이 차단됨";
    help.innerText = "브라우저나 휴대폰 설정에서 글림 알림을 허용해주세요.";
    help.dataset.state = "warning";
    return;
  }

  const isEnabled =
    Notification.permission === "granted" && Boolean(getStoredPushFid());
  toggle.checked = isEnabled;
  toggle.disabled = false;
  status.innerText = isEnabled
    ? "켜짐 · 앱을 닫아도 알림을 받아요."
    : Notification.permission === "default"
      ? "꺼짐 · 스위치를 눌러 허용"
      : "꺼짐";
  help.innerText = isEnabled
    ? "이 기기에만 적용됩니다."
    : "앱을 닫아도 새 소식을 받을 수 있습니다.";
  help.dataset.state = isEnabled ? "ready" : "";
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
    showAppAlert("이 기기의 푸시 알림을 켰습니다.");
  } catch (error) {
    console.warn("푸시 알림 설정 실패:", error);
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

  if (pushMessaging && isPushConfigured()) {
    try {
      const modules = await loadFirebasePushModules();
      await modules.messaging.unregister(pushMessaging);
    } catch (error) {
      if (!silent) console.warn("FCM 기기 등록 해제 실패:", error);
    }
  }
  updatePushNotificationSettingsUI();
}

async function initializePushNotifications() {
  updatePushNotificationSettingsUI();
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
    console.warn("푸시 알림 카테고리 동기화 실패:", error.message);
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
      console.warn("푸시 알림 발송 요청 실패: 로그인 세션이 없습니다.");
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
      console.warn(
        "푸시 알림 발송 요청 실패:",
        result.error || `${response.status} ${response.statusText}`,
      );
    }
  } catch (error) {
    console.warn("푸시 알림 발송 요청 실패:", error);
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

async function performAccountDeletion() {
  if (!currentUser) return;
  const deletingUserId = currentUser.id;
  showAppAlert("계정 정보를 안전하게 삭제하고 있습니다...");

  const { error } = await client.functions.invoke("delete-account", {
    body: { confirm: true },
  });
  if (error) {
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

  let query = client
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });
  const userKey = currentUser ? currentUser.id : "";
  let targetIds = [];

  if (tabType === "my") {
    query = query.eq("user_id", currentUser.id);
  } else if (tabType === "bookmark") {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(`bookmarked_${userKey}_`))
        targetIds.push(key.replace(`bookmarked_${userKey}_`, ""));
    }
    if (targetIds.length === 0)
      return (grid.innerHTML =
        '<div style="grid-column: 1 / -1; text-align: center; color: #555; padding: 50px 0;">저장된 글이 없습니다.</div>');
    query = query.in("id", targetIds);
  } else if (tabType === "like") {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(`liked_${userKey}_`))
        targetIds.push(key.replace(`liked_${userKey}_`, ""));
    }
    if (targetIds.length === 0)
      return (grid.innerHTML =
        '<div style="grid-column: 1 / -1; text-align: center; color: #555; padding: 50px 0;">좋아요한 글이 없습니다.</div>');
    query = query.in("id", targetIds);
  }

  const { data, error } = await query;
  if (error)
    return (grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #ff3b30;">오류</div>`);
  const visiblePosts = filterBlockedPosts(data);
  if (visiblePosts.length === 0)
    return (grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #555; padding: 50px 0;">기록이 없습니다.</div>`);

  contextPostCollections.set(contextKey, visiblePosts);
  grid.innerHTML = visiblePosts
    .map(
      (post, index) => `
    <div class="grid-item" onclick="openContextPostFeed('${contextKey}', ${index})">
      <div class="grid-text">${post.content}</div>
    </div>
  `,
    )
    .join("");
}

function createContextFeedPost(post) {
  const postElement = document.createElement("div");
  postElement.className = "post";
  const isOwnPost = Boolean(currentUser && post.user_id === currentUser.id);
  const moreMenuAction = isOwnPost
    ? `<button class="more-menu-item" onclick="deletePost('${post.id}')">삭제</button>`
    : `<button class="more-menu-item" onclick="reportPost('${post.id}')">신고하기</button>`;

  // ✅ 타이머와 알고리즘 계산을 위해 데이터 심어두기
  postElement.dataset.postId = post.id;
  postElement.dataset.userId = post.user_id || "";
  postElement.dataset.mood = post.mood || "";
  postElement.dataset.bgmUrl = post.bgm_url || "";

  const userKey = currentUser ? currentUser.id : "guest";
  const hasLiked = localStorage.getItem(`liked_${userKey}_${post.id}`)
    ? "font-variation-settings: 'FILL' 1; color: #ff3b30;"
    : "";
  const hasBookmarked = localStorage.getItem(`bookmarked_${userKey}_${post.id}`)
    ? "font-variation-settings: 'FILL' 1; color: #FFCC00;"
    : "";
  const bookmarkText = localStorage.getItem(`bookmarked_${userKey}_${post.id}`)
    ? "담김"
    : "저장";

  postElement.innerHTML = `
    <div class="text-content">${post.content.replace(/\n/g, "<br>")}</div>
    <div class="author-info">
      <div
        class="author-name${post.user_id ? " author-link" : ""}"
        ${post.user_id ? `onclick="openUserProfile('${post.user_id}')"` : ""}
      >${post.author || "익명"}</div>
      <div class="post-time">${timeForToday(post.created_at)}</div>
      ${renderPostBgmControl(post)}
    </div>
    <div class="side-actions">
      <div class="action-btn" onclick="incrementMetric('${post.id}', 'likes_count', this)">
        <span class="material-symbols-outlined icon-like" style="${hasLiked}">favorite</span>
        <span class="action-count">${post.likes_count || 0}</span>
      </div>
      <div class="action-btn" onclick="openSheet('commentSheet', '${post.id}')">
        <span class="material-symbols-outlined">chat_bubble</span>
        <span class="action-count">${post.dislikes_count || 0}</span>
      </div>
      <div class="action-btn" onclick="toggleBookmark('${post.id}', this)">
        <span class="material-symbols-outlined icon-bookmark" style="${hasBookmarked}">bookmark</span>
        <span class="action-count">${bookmarkText}</span>
      </div>
      <div class="action-btn" data-share-post>
        <span class="material-symbols-outlined">share</span>
        <span class="action-count">공유</span>
      </div>
      <div class="action-btn more-menu-wrapper" onclick="toggleMoreMenu(this, event)">
        <span class="material-symbols-outlined">more_vert</span>
        <div class="more-menu">
          ${moreMenuAction}
        </div>
      </div>
    </div>`;

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

function setupSwipeBackNavigation() {
  addInteractiveSwipeBack(
    document.getElementById("view-bgm-picker"),
    () => "view-write",
    closeBgmPicker,
  );
  addInteractiveSwipeBack(
    document.getElementById("view-context-feed"),
    () => contextFeedReturnViewId,
    closeContextPostFeed,
  );
  addInteractiveSwipeBack(
    document.getElementById("view-user-profile"),
    () => userProfileReturnViewId,
    closeUserProfile,
  );
  addInteractiveSwipeBack(
    document.getElementById("view-settings"),
    () => "view-profile",
    closeSettingsView,
  );
  addInteractiveSwipeBack(
    document.getElementById("view-account-center"),
    () => "view-settings",
    closeAccountCenterView,
  );
  addInteractiveSwipeBack(
    document.getElementById("view-theme-settings"),
    () => "view-settings",
    closeThemeSettingsView,
  );
  addInteractiveSwipeBack(
    document.getElementById("view-notification-settings"),
    () => "view-settings",
    closeNotificationSettingsView,
  );
  addInteractiveSwipeBack(
    document.getElementById("view-privacy-policy"),
    () => "view-settings",
    closePrivacyPolicyView,
  );
  addInteractiveSwipeBack(
    document.getElementById("view-terms-of-service"),
    () => "view-settings",
    closeTermsOfServiceView,
  );
  addInteractiveSwipeBack(
    document.getElementById("view-notice-detail"),
    () => noticeReturnViewId,
    completeNoticeSwipeBack,
    {
      onStart: prepareNoticeSwipeUnderlay,
      onCancel: cancelNoticeSwipeUnderlay,
    },
  );
}

async function fetchPosts() {
  // ✅ 1. 일단 최신 글을 넉넉히(100개) 가져옵니다.
  const { data, error } = await client
    .from("posts")
    .select("*")
    .neq("author", "🚨글림 운영자")
    .order("created_at", { ascending: false })
    .limit(100);

  const feedContainer = document.getElementById("postFeed");
  if (error)
    return (feedContainer.innerHTML = `<div style="height:100vh; display:flex; justify-content:center; align-items:center;">데이터 오류</div>`);

  observer.disconnect();
  feedContainer.innerHTML = "";
  const visiblePosts = filterBlockedPosts(data);
  if (visiblePosts.length === 0)
    return (feedContainer.innerHTML = `<div style="height:100vh; display:flex; justify-content:center; align-items:center; color:#555;">아직 보여드릴 문장이 없습니다.</div>`);

  // ✅ 2. 내 취향 점수를 불러와서 알고리즘 정렬 (Sorting)
  const userMoodScores = JSON.parse(
    localStorage.getItem("glim_mood_scores") || "{}",
  );

  const seenPosts = JSON.parse(localStorage.getItem("glim_seen_posts") || "[]");

  visiblePosts.sort((a, b) => {
    // 기본 점수: 내가 좋아하는 감성일수록 가산점 + 남들이 누른 좋아요 점수
    let scoreA = (userMoodScores[a.mood] || 0) * 1.5 + (a.likes_count || 0) * 2;
    let scoreB = (userMoodScores[b.mood] || 0) * 1.5 + (b.likes_count || 0) * 2;

    // 시간 페널티: 너무 옛날 글이 계속 상단에 뜨지 않게 감점 (밀리초를 일 단위로 변환)
    let timePenaltyA =
      (Date.now() - new Date(a.created_at).getTime()) / (1000 * 60 * 60 * 24);
    let timePenaltyB =
      (Date.now() - new Date(b.created_at).getTime()) / (1000 * 60 * 60 * 24);

    // 🛑 읽은 글 패널티: 이미 본 글이면 -100점 폭탄 (무조건 피드 맨 아래로 유배)
    let seenPenaltyA = seenPosts.includes(a.id) ? 100 : 0;
    let seenPenaltyB = seenPosts.includes(b.id) ? 100 : 0;

    // 🎲 랜덤 스파이스: 동점일 때마다 순서가 미세하게 바뀌도록 0~2점 무작위 부여
    let randomSpiceA = Math.random() * 2;
    let randomSpiceB = Math.random() * 2;

    // 최종 점수 합산
    let finalScoreA = scoreA - timePenaltyA - seenPenaltyA + randomSpiceA;
    let finalScoreB = scoreB - timePenaltyB - seenPenaltyB + randomSpiceB;

    // 최종 점수 비교 (내림차순 정렬)
    return finalScoreB - finalScoreA;
  });

  // ✅ 3. 정렬된 순서대로 화면에 그림
  visiblePosts.forEach((post) => {
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
  likeCount.innerText = post.likes_count || 0;
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

  let query = client
    .from("posts")
    .select("*")
    .neq("author", "🚨글림 운영자")
    .eq("mood", mood.value)
    .order("created_at", { ascending: false })
    .limit(30);
  if (keyword) query = query.ilike("content", `%${keyword}%`);

  const { data, error } = await query;
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

  let todayQuery = client
    .from("posts")
    .select("*")
    .neq("author", "🚨글림 운영자")
    .gte("created_at", startOfToday.toISOString())
    .order("likes_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(30);
  let allTimeQuery = client
    .from("posts")
    .select("*")
    .neq("author", "🚨글림 운영자")
    .order("likes_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(30);
  if (keyword) {
    todayQuery = todayQuery.ilike("content", `%${keyword}%`);
    allTimeQuery = allTimeQuery.ilike("content", `%${keyword}%`);
  }

  const [todayResult, allTimeResult] = await Promise.all([
    todayQuery,
    allTimeQuery,
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

function handleExploreSearchInput() {
  openExploreSearch();
  document.getElementById("exploreRecentSearches").hidden = false;
  document.getElementById("exploreSearchResults").hidden = true;
  renderExploreSearchHistory();
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
  mood.innerText = `${moodOption?.label || "감성"} · 좋아요 ${post.likes_count || 0}`;
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

async function searchPosts(forcedQuery = null) {
  const input = document.getElementById("searchInput");
  const query = String(forcedQuery ?? input?.value ?? "").trim();
  if (!query) {
    openExploreSearch();
    renderExploreSearchHistory();
    return;
  }

  if (input) input.value = query;
  openExploreSearch();
  saveExploreSearchHistory(query);
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
    client
      .from("posts")
      .select("*")
      .neq("author", "🚨글림 운영자")
      .ilike("content", `%${query}%`)
      .order("created_at", { ascending: false })
      .limit(50),
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
  if (column === "likes_count") {
    if (!currentUser) return alert("좋아요를 누르려면 로그인이 필요합니다.");
    const userKey = currentUser.id;
    const storageKey = `liked_${userKey}_${postId}`;
    const countSpan = element.querySelector(".action-count");
    const icon = element.querySelector(".icon-like");

    if (localStorage.getItem(storageKey)) {
      localStorage.removeItem(storageKey);
      let currentCount = parseInt(countSpan.innerText) - 1;
      countSpan.innerText = currentCount < 0 ? 0 : currentCount;
      icon.style.fontVariationSettings = "'FILL' 0";
      icon.style.color = "#ccc";
      const { data } = await client
        .from("posts")
        .select(column)
        .eq("id", postId)
        .single();
      let nextCount = (data[column] || 0) - 1;
      await client
        .from("posts")
        .update({ [column]: nextCount < 0 ? 0 : nextCount })
        .eq("id", postId);
    } else {
      localStorage.setItem(storageKey, "true");
      updateMoodScore(element.closest(".post").dataset.mood, 5);
      countSpan.innerText = parseInt(countSpan.innerText) + 1;
      icon.style.fontVariationSettings = "'FILL' 1";
      icon.style.color = "#ff3b30";
      const { data: postData } = await client
        .from("posts")
        .select(`author, user_id, ${column}`)
        .eq("id", postId)
        .single();
      await client
        .from("posts")
        .update({ [column]: (postData[column] || 0) + 1 })
        .eq("id", postId);

      const myNickname = currentUser.user_metadata?.random_nickname;
      if (postData.author !== myNickname) {
        const { error: notificationError } = await client
          .from("notifications")
          .insert([
            {
              target_user: postData.author,
              actor_nickname: myNickname,
              type: "like",
              post_id: postId,
            },
          ]);
        if (notificationError) {
          console.warn("앱 내부 공감 알림 저장 실패:", notificationError.message);
        }
        void sendPushNotification(postData.user_id, "likes", postId);
      }
    }
  }
}

function toggleBookmark(postId, element) {
  if (!currentUser) return alert("북마크를 이용하려면 로그인이 필요합니다.");
  const userKey = currentUser.id;
  const storageKey = `bookmarked_${userKey}_${postId}`;
  const icon = element.querySelector(".icon-bookmark");
  const countSpan = element.querySelector(".action-count");

  if (localStorage.getItem(storageKey)) {
    localStorage.removeItem(storageKey);
    icon.style.fontVariationSettings = "'FILL' 0";
    icon.style.color = "#ccc";
    countSpan.innerText = "저장";
  } else {
    localStorage.setItem(storageKey, "true");
    updateMoodScore(element.closest(".post").dataset.mood, 8);
    icon.style.fontVariationSettings = "'FILL' 1";
    icon.style.color = "#FFCC00";
    countSpan.innerText = "담김";
  }
}

function openSheet(id, postId = null) {
  if (id === "commentSheet") {
    currentPostIdForComment = postId;
    fetchComments(postId);
  }
  const sheet = document.getElementById(id);
  const backdrop = document.getElementById(`${id}Backdrop`);
  sheet.style.transition = "bottom 0.4s cubic-bezier(0.25, 1, 0.5, 1)";
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
}

async function fetchComments(postId) {
  const list = document.getElementById("commentList");
  list.innerHTML =
    '<div style="text-align:center; color:#555; margin-top:20px;">댓글을 가져오는 중...</div>';
  const { data, error } = await client
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) return (list.innerHTML = "오류 발생");
  const visibleComments = filterBlockedComments(data);
  if (visibleComments.length === 0)
    return (list.innerHTML =
      '<div style="text-align:center; color:#555; margin-top:20px;">첫 번째로 댓글을 남겨 보세요.</div>');

  list.innerHTML = visibleComments
    .map((c) => {
      // ✅ 옛날 데이터에 이메일이 들어있을 경우를 대비하여 @ 뒷부분 제거
      let authorNickname = c.user_email || "익명";
      if (authorNickname.includes("@")) {
        authorNickname = authorNickname.split("@")[0];
      }

      const userKey = currentUser ? currentUser.id : "guest";
      const hasLiked = localStorage.getItem(`comment_liked_${userKey}_${c.id}`)
        ? "font-variation-settings: 'FILL' 1; color: #ff3b30;"
        : "font-variation-settings: 'FILL' 0; color: #666;";

      return `
      <div class="comment-item">
        <div class="comment-author">${authorNickname}</div>
        <div class="comment-text">${c.content}</div>
        <div class="comment-actions">
          <div class="comment-action-btn" onclick="toggleCommentLike('${c.id}', this)">
            <span class="material-symbols-outlined icon-like" style="${hasLiked}">favorite</span>
            <span class="action-count">${c.likes_count || 0}</span>
          </div>
          <div class="comment-action-btn" onclick="reportComment('${c.id}')">
            <span class="material-symbols-outlined" style="font-size:1rem;">report</span>
            <span>신고</span>
          </div>
        </div>
      </div>
    `;
    })
    .join("");
  list.scrollTop = list.scrollHeight;
}

async function toggleCommentLike(commentId, element) {
  if (!currentUser) return alert("좋아요를 누르려면 로그인이 필요합니다.");

  const userKey = currentUser.id;
  const storageKey = `comment_liked_${userKey}_${commentId}`;
  const countSpan = element.querySelector(".action-count");
  const icon = element.querySelector(".icon-like");

  if (localStorage.getItem(storageKey)) {
    localStorage.removeItem(storageKey);
    let currentCount = parseInt(countSpan.innerText) - 1;
    countSpan.innerText = currentCount < 0 ? 0 : currentCount;
    icon.style.fontVariationSettings = "'FILL' 0";
    icon.style.color = "#666";

    const { data } = await client
      .from("comments")
      .select("likes_count")
      .eq("id", commentId)
      .single();
    let nextCount = (data.likes_count || 0) - 1;
    await client
      .from("comments")
      .update({ likes_count: nextCount < 0 ? 0 : nextCount })
      .eq("id", commentId);
  } else {
    localStorage.setItem(storageKey, "true");
    countSpan.innerText = parseInt(countSpan.innerText) + 1;
    icon.style.fontVariationSettings = "'FILL' 1";
    icon.style.color = "#ff3b30";

    const { data } = await client
      .from("comments")
      .select("likes_count")
      .eq("id", commentId)
      .single();
    await client
      .from("comments")
      .update({ likes_count: (data.likes_count || 0) + 1 })
      .eq("id", commentId);
  }
}

function reportComment(commentId) {
  showAppConfirm(
    "이 댓글을 신고하시겠습니까?",
    () => submitCommentReport(commentId),
    {
      title: "댓글 신고",
      icon: "report",
      confirmText: "신고하기",
      isDestructive: true,
    },
  );
}

async function submitCommentReport(commentId) {
  const { data, error: readError } = await client
    .from("comments")
    .select("reports_count")
    .eq("id", commentId)
    .single();
  if (readError || !data) {
    showAppAlert("신고를 접수하지 못했습니다. 잠시 후 다시 시도해주세요.");
    return;
  }

  const { error: updateError } = await client
    .from("comments")
    .update({ reports_count: (data.reports_count || 0) + 1 })
    .eq("id", commentId);
  if (updateError) {
    showAppAlert("신고를 접수하지 못했습니다. 잠시 후 다시 시도해주세요.");
    return;
  }

  showAppAlert("신고가 접수되었습니다. 관리자 검토 후 조치됩니다.");
}

async function submitComment() {
  if (!currentUser) {
    alert("댓글을 남기려면 로그인이 필요합니다.");
    closeSheet("commentSheet");
    switchTab("profile");
    return;
  }
  const content = document.getElementById("commentInput").value.trim();
  if (!content) return;

  // ✅ 확실하게 본인이 설정한 닉네임만 들어가도록 처리
  const myNickname =
    currentUser.user_metadata?.random_nickname ||
    currentUser.email.split("@")[0];

  let { error } = await client.from("comments").insert([
    {
      post_id: currentPostIdForComment,
      user_id: currentUser.id,
      user_email: myNickname,
      content: content,
    },
  ]);
  if (error?.code === "PGRST204") {
    ({ error } = await client.from("comments").insert([
      {
        post_id: currentPostIdForComment,
        user_email: myNickname,
        content: content,
      },
    ]));
  }

  if (!error) {
    document.getElementById("commentInput").value = "";
    fetchComments(currentPostIdForComment);

    const { data: postData } = await client
      .from("posts")
      .select("author, user_id, dislikes_count")
      .eq("id", currentPostIdForComment)
      .single();
    await client
      .from("posts")
      .update({ dislikes_count: (postData.dislikes_count || 0) + 1 })
      .eq("id", currentPostIdForComment);

    if (postData.author !== myNickname) {
      const notificationPayload = {
        target_user: postData.author,
        actor_nickname: myNickname,
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
        console.warn("앱 내부 댓글 알림 저장 실패:", notificationError.message);
      }
      void sendPushNotification(
        postData.user_id,
        "comments",
        currentPostIdForComment,
      );
    }

    fetchPosts();
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
  const { data: post, error } = await client
    .from("posts")
    .select("*")
    .eq("id", postId)
    .maybeSingle();
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
  const myNickname = currentUser.user_metadata?.random_nickname;
  const preferences = getNotificationPreferences();
  const [notificationResult, announcementResult] = await Promise.all([
    client
      .from("notifications")
      .select("*")
      .eq("target_user", myNickname)
      .order("created_at", { ascending: false }),
    preferences.announcements
      ? client
          .from("posts")
          .select("id, content, created_at")
          .eq("author", "🚨글림 운영자")
          .order("created_at", { ascending: false })
          .limit(10)
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
    console.warn(
      "운영자 알림을 불러오지 못했습니다:",
      announcementResult.error.message,
    );
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
        ? `role="button" tabindex="0" data-notification-type="${escapeHtml(n.type || "")}" data-post-id="${escapeHtml(n.post_id || "")}" data-actor-nickname="${escapeHtml(n.actor_nickname || "")}" onclick="openNotificationTarget(this)" onkeydown="if(event.key === 'Enter' || event.key === ' '){event.preventDefault();openNotificationTarget(this);}"`
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

  const authorNickname =
    currentUser.user_metadata?.random_nickname ||
    currentUser.email.split("@")[0];

  const { error } = await client.from("posts").insert([
    {
      content: content,
      author: authorNickname,
      user_id: currentUser.id,
      bgm_url: bgmUrl,
      bgm_title: bgmTitle,
      mood: mood, // ✅ DB에 저장
      likes_count: 0,
      dislikes_count: 0,
      reports_count: 0,
    },
  ]);

  if (error) {
    alert("글 등록 중 오류가 발생했습니다.");
    return;
  }

  document.getElementById("postContent").value = "";
  document.getElementById("postBgm").value = "";
  document.getElementById("postMood").value = ""; // ✅ 태그 초기화
  updateSelectedBgmLabel();
  updateSelectedMoodLabel();
  updateCharCount();
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
    console.error("공유 이미지 생성 실패:", error);
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
  showAppConfirm("이 글을 신고하시겠습니까?", () => submitPostReport(postId), {
    title: "게시글 신고",
    icon: "report",
    confirmText: "신고하기",
    isDestructive: true,
  });
}

async function submitPostReport(postId) {
  const { data, error: readError } = await client
    .from("posts")
    .select("reports_count, user_id")
    .eq("id", postId)
    .single();
  if (readError || !data) {
    showAppAlert("신고를 접수하지 못했습니다. 잠시 후 다시 시도해주세요.");
    return;
  }
  if (currentUser && data.user_id === currentUser.id) {
    showAppAlert("본인이 작성한 글은 신고할 수 없습니다.");
    return;
  }

  const { error: updateError } = await client
    .from("posts")
    .update({ reports_count: (data.reports_count || 0) + 1 })
    .eq("id", postId);
  if (updateError) {
    showAppAlert("신고를 접수하지 못했습니다. 잠시 후 다시 시도해주세요.");
    return;
  }

  showAppAlert("신고가 접수되었습니다. 관리자 검토 후 조치됩니다.");
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

  const { data, error } = await client
    .from("posts")
    .select("*")
    .eq("author", "🚨글림 운영자")
    .order("created_at", { ascending: false });

  if (error)
    return (list.innerHTML =
      '<div style="text-align:center; color:#ff3b30; margin-top:20px;">오류가 발생했습니다.</div>');
  if (data.length === 0)
    return (list.innerHTML =
      '<div style="text-align:center; color:#555; margin-top:20px;">등록된 공지사항이 없습니다.</div>');

  list.innerHTML = data
    .map((notice) => {
      let title = "공지사항";
      let text = notice.content;

      if (notice.content.startsWith("[공지]")) {
        const parts = notice.content.replace("[공지]", "").split("|||");
        if (parts.length === 2) {
          title = parts[0];
          text = parts[1];
        } else {
          text = notice.content.replace("[공지]\n\n", "");
        }
      }

      const dateStr = new Date(notice.created_at).toLocaleDateString();
      const safeTitle = title.replace(/'/g, "\\'").replace(/"/g, "&quot;");
      const safeText = text
        .replace(/'/g, "\\'")
        .replace(/"/g, "&quot;")
        .replace(/\n/g, "<br>");

      return `
      <div class="notice-list-item" onclick="viewNoticeDetail('${safeTitle}', '${dateStr}', '${safeText}')"
           style="background: #111; border-radius: 12px; padding: 20px; margin-bottom: 10px; border: 1px solid #222; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;">
        <div class="notice-list-item-title" style="color: #eee; font-size: 1.05rem; font-family: 'Noto Serif KR', serif; font-weight: 300;">${title}</div>
        <span class="material-symbols-outlined notice-list-item-icon" style="color: #555;">chevron_right</span>
      </div>
    `;
    })
    .join("");
}

function closeNoticeDetail() {
  activateAppView(noticeReturnViewId);
  openSheet("noticeSheet");
}

function viewNoticeDetail(title, date, content) {
  closeSheet("noticeSheet");
  activateAppView("view-notice-detail");

  const container = document.getElementById("noticeDetailContainer");
  container.innerHTML = `
    <div class="notice-detail-title" style="color: #fff; font-weight: 700; font-size: 1.6rem; margin-bottom: 15px; font-family: 'Noto Serif KR', serif;">${title}</div>
    <div class="notice-detail-date" style="color: #666; font-size: 0.9rem; margin-bottom: 40px; font-family: -apple-system, sans-serif; border-bottom: 1px solid #222; padding-bottom: 15px;">${date}</div>
    <div class="notice-detail-content" style="color: #eaeaea; font-size: 1.15rem; line-height: 1.8; font-family: 'Noto Serif KR', serif; font-weight: 300; word-break: keep-all;">${content}</div>
  `;
}

window.setTimeout(() => hideAppSplash({ force: true }), 7000);
init()
  .catch((error) => {
    console.error("앱 초기화 실패:", error);
  })
  .finally(() => hideAppSplash());

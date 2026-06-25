const SUPABASE_URL = "https://qdnpeliqtxdglqewbvgg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mwYlhge63nnNjL9lAFhxRw_fxRtRGvO";
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ADMIN_EMAIL = "weardockm@gmail.com";

let currentPlayingBtn = null; // 현재 재생중인 버튼 기억
let isBgmEnabled = true;
let currentBgmUrl = "";
let bgmSyncFrame = null;
let isWaitingForBgmGesture = false;
let previewingBgmUrl = "";
let currentUser = null;
let currentPostIdForComment = null;
let viewedProfileUserId = null;
let viewedProfileIsFollowing = false;
let userProfileReturnViewId = "view-home";
let contextFeedReturnViewId = "view-home";
let isRefreshing = false;
let lastNavTapTab = null;
let lastNavTapTime = 0;
let pullIndicatorHideTimer = null;
let selectedProfileAvatarFile = null;
let shouldRemoveProfileAvatar = false;
let editAvatarPreviewObjectUrl = null;
let avatarCropSourceUrl = null;
let avatarCropOriginalFile = null;
const AVATAR_CROP_OUTPUT_SIZE = 512;
const MAX_AVATAR_SOURCE_SIZE = 15 * 1024 * 1024;
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
    label: "조용한 사색",
    description: "천천히 가라앉는 생각",
    icon: "psychology",
  },
  {
    value: "위로",
    label: "따뜻한 위로",
    description: "부드럽게 건네는 말",
    icon: "volunteer_activism",
  },
  {
    value: "우울",
    label: "비 오는 우울",
    description: "조금 낮게 내려앉은 마음",
    icon: "water_drop",
  },
  {
    value: "설렘",
    label: "기분 좋은 설렘",
    description: "가볍게 뛰는 순간",
    icon: "auto_awesome",
  },
  {
    value: "일상",
    label: "소소한 일상",
    description: "작게 남겨둔 하루",
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
let isAppAlertReady = false;
let appAlertPreviousFocus = null;
let appAlertOnClose = null;

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

function getPostTextSizeClass(content) {
  const length = content.trim().length;
  if (length > 250) return "text-content-very-long";
  if (length > 180) return "text-content-long";
  if (length > 110) return "text-content-medium";
  return "";
}

function fitPostTextToViewport(postElement) {
  const textElement = postElement.querySelector(".text-content");
  if (!textElement) return;

  textElement.style.fontSize = "";
  textElement.style.lineHeight = "";
  textElement.style.maxHeight = "";
  textElement.classList.remove("text-content-scrollable");

  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  const availableHeight = Math.max(160, viewportHeight - 250);
  let fontSize = parseFloat(getComputedStyle(textElement).fontSize);

  while (textElement.scrollHeight > availableHeight && fontSize > 10) {
    fontSize -= 0.5;
    textElement.style.fontSize = `${fontSize}px`;
    textElement.style.lineHeight = "1.35";
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
  document
    .querySelector(".bottom-nav")
    ?.classList.toggle("is-hidden", viewId === "view-bgm-picker");
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

  alertElement.addEventListener("click", (event) => {
    const closeTarget =
      event.target instanceof Element &&
      event.target.closest("[data-app-alert-close]");

    if (closeTarget) {
      closeAppAlert();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && alertElement.classList.contains("open")) {
      closeAppAlert();
    }
  });
}

function showAppAlert(message, onClose) {
  const alertElement = document.getElementById("appAlert");
  const messageElement = document.getElementById("appAlertMessage");
  const closeButton = alertElement?.querySelector("[data-app-alert-close]");

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
  messageElement.textContent = String(message ?? "");
  alertElement.classList.add("open");
  alertElement.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => {
    closeButton?.focus({ preventScroll: true });
  });
}

function closeAppAlert() {
  const alertElement = document.getElementById("appAlert");
  if (!alertElement) return;
  const onClose = appAlertOnClose;

  alertElement.classList.remove("open");
  alertElement.setAttribute("aria-hidden", "true");
  appAlertOnClose = null;

  if (
    appAlertPreviousFocus &&
    document.contains(appAlertPreviousFocus) &&
    alertElement.contains(document.activeElement)
  ) {
    appAlertPreviousFocus.focus({ preventScroll: true });
  }
  appAlertPreviousFocus = null;
  if (typeof onClose === "function") onClose();
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
  if (tabName === "explore") fetchExplorePosts();
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

async function init() {
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
  updateAuthUI();
  await fetchPosts();

  client.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    if (currentUser && !currentUser.user_metadata?.random_nickname) {
      const newNick = generateRandomNickname();
      await client.auth.updateUser({ data: { random_nickname: newNick } });
      currentUser.user_metadata.random_nickname = newNick;
    }
    await syncCurrentUserProfile();
    updateAuthUI();
  });

  [
    "commentSheet",
    "settingsSheet",
    "noticeSheet",
    "editProfileSheet",
    "followListSheet",
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
  setupAvatarCropper();
  setupBgmPicker();
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
  view.style.transition = animate
    ? "transform 0.24s cubic-bezier(0.25, 1, 0.5, 1)"
    : "none";
  view.style.transform = "";
  setTimeout(() => {
    if (!view.style.transform) view.style.transition = "";
  }, 250);
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
      await fetchExplorePosts(
        document.getElementById("searchInput").value.trim(),
      );
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
    await wait(900);
  } finally {
    clearTimeout(refreshSafetyTimer);
    indicator.classList.remove("visible", "refreshing", "complete");
    // 삭제됨: icon.innerText = "refresh";
    icon.style.transform = "";
    resetRefreshViewPosition(view);
    await wait(750);
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
          resetRefreshViewPosition(view);
          hidePullRefreshIndicator();
          return;
        }

        event.preventDefault();
        pullDistance = deltaY;
        setRefreshHeaderHidden(true);
        view.style.transition = "none";
        view.style.transform = `translate3d(0, ${deltaY * 0.22}px, 0)`;
        if (pullDistance > 12) showPullRefreshIndicator(pullDistance);
      },
      { passive: false },
    );

    view.addEventListener(
      "touchend",
      () => {
        if (!isTracking) return;
        isTracking = false;
        resetRefreshViewPosition(view);
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
        resetRefreshViewPosition(view);
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
    avatar_url:
      currentUser.user_metadata?.avatar_url ||
      currentUser.user_metadata?.picture ||
      null,
    updated_at: new Date().toISOString(),
  };
}

async function syncCurrentUserProfile() {
  const profile = getCurrentProfileData();
  if (!profile) return;

  const { error } = await client.from("profiles").upsert(profile);
  if (error) console.warn("프로필 동기화 실패:", error.message);
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

  if (avatarUrl) {
    const image = document.createElement("img");
    image.src = avatarUrl;
    image.alt = "";
    image.style.cssText = "width:100%; height:100%; object-fit:cover;";
    avatar.appendChild(image);
  } else {
    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined";
    icon.style.cssText = `font-size:${iconSize}; color:#555;`;
    icon.innerText = "person";
    avatar.appendChild(icon);
  }
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
  return (
    currentUser?.user_metadata?.avatar_url ||
    currentUser?.user_metadata?.picture ||
    null
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
  setEditProfileAvatarPreview(currentUser?.user_metadata?.picture || null);
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
    await client.from("notifications").insert([
      {
        target_user: button.dataset.nickname,
        actor_nickname: myNickname,
        type: "follow",
      },
    ]);
  }
}

function createFollowListRow(profile) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "follow-list-row";
  row.addEventListener("click", () => openUserProfile(profile.id));

  const avatar = document.createElement("span");
  avatar.className = "follow-list-avatar";
  if (profile.avatar_url) {
    const image = document.createElement("img");
    image.src = profile.avatar_url;
    image.alt = "";
    avatar.appendChild(image);
  } else {
    const icon = document.createElement("span");
    icon.className = "material-symbols-outlined";
    icon.innerText = "person";
    avatar.appendChild(icon);
  }

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

  const userIds = relations.map((relation) => relation[idColumn]);
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
      avatarUrl = null;
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

    await syncCurrentUserProfile();

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
  if (error) alert(provider + " 로그인 실패");
}

async function handleSignOut() {
  await client.auth.signOut();
  closeSheet("settingsSheet");
  alert("로그아웃 되었습니다.");
  switchTab("home");
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
  if (data.length === 0)
    return (grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #555; padding: 50px 0;">기록이 없습니다.</div>`);

  contextPostCollections.set(contextKey, data);
  grid.innerHTML = data
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

  // ✅ 타이머와 알고리즘 계산을 위해 데이터 심어두기
  postElement.dataset.postId = post.id;
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
    <div class="text-content ${getPostTextSizeClass(post.content)}">${post.content.replace(/\n/g, "<br>")}</div>
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
      <div class="action-btn" onclick="sharePost('${encodeURIComponent(post.content)}')">
        <span class="material-symbols-outlined">share</span>
        <span class="action-count">공유</span>
      </div>
      <div class="action-btn more-menu-wrapper" onclick="toggleMoreMenu(this, event)">
        <span class="material-symbols-outlined">more_vert</span>
        <div class="more-menu">
          <button class="more-menu-item" onclick="reportPost('${post.id}')">신고하기</button>
        </div>
      </div>
    </div>`;

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
  switchTab("profile");
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
    document.getElementById("view-notice-detail"),
    () => "view-profile",
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
  if (data.length === 0)
    return (feedContainer.innerHTML = `<div style="height:100vh; display:flex; justify-content:center; align-items:center; color:#555;">첫 번째 문장을 공유해 보세요.</div>`);

  // ✅ 2. 내 취향 점수를 불러와서 알고리즘 정렬 (Sorting)
  const userMoodScores = JSON.parse(
    localStorage.getItem("glim_mood_scores") || "{}",
  );

  const seenPosts = JSON.parse(localStorage.getItem("glim_seen_posts") || "[]");

  data.sort((a, b) => {
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
  data.forEach((post) => {
    const postElement = createContextFeedPost(post);
    feedContainer.appendChild(postElement);
    fitPostTextToViewport(postElement);
    observer.observe(postElement);
  });

  requestBgmSyncForView(document.getElementById("view-home"));
}

async function fetchExplorePosts(keyword = "") {
  const grid = document.getElementById("exploreGrid");
  contextPostCollections.set("explore", []);
  contextPostTitles.set(
    "explore",
    keyword ? `‘${keyword}’ 검색 결과` : "탐색 게시물",
  );
  grid.innerHTML =
    '<div style="grid-column: 1 / -1; padding: 50px 0; text-align: center; color: #555;">불러오는 중...</div>';
  let query = client
    .from("posts")
    .select("*")
    .neq("author", "🚨글림 운영자")
    .order("likes_count", { ascending: false })
    .limit(30);
  if (keyword) query = query.ilike("content", `%${keyword}%`);

  const { data, error } = await query;
  if (error)
    return (grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #ff3b30;">오류</div>`);
  if (data.length === 0)
    return (grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #555; padding: 50px 0;">결과 없음.</div>`);

  contextPostCollections.set("explore", data);
  grid.innerHTML = data
    .map(
      (post, index) => `
    <div class="grid-item" onclick="openContextPostFeed('explore', ${index})">
      <div class="grid-text">${post.content}</div>
      <div class="grid-stats"><span class="material-symbols-outlined">favorite</span>${post.likes_count || 0}</div>
    </div>
  `,
    )
    .join("");
}

function searchPosts() {
  fetchExplorePosts(document.getElementById("searchInput").value.trim());
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
        .select(`author, ${column}`)
        .eq("id", postId)
        .single();
      await client
        .from("posts")
        .update({ [column]: (postData[column] || 0) + 1 })
        .eq("id", postId);

      const myNickname = currentUser.user_metadata?.random_nickname;
      if (postData.author !== myNickname) {
        await client.from("notifications").insert([
          {
            target_user: postData.author,
            actor_nickname: myNickname,
            type: "like",
            post_id: postId,
          },
        ]);
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
  if (data.length === 0)
    return (list.innerHTML =
      '<div style="text-align:center; color:#555; margin-top:20px;">첫 번째로 댓글을 남겨 보세요.</div>');

  list.innerHTML = data
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

async function reportComment(commentId) {
  if (!confirm("이 댓글을 신고하시겠습니까?")) return;
  const { data } = await client
    .from("comments")
    .select("reports_count")
    .eq("id", commentId)
    .single();
  await client
    .from("comments")
    .update({ reports_count: (data.reports_count || 0) + 1 })
    .eq("id", commentId);
  alert("신고가 접수되었습니다. 관리자 검토 후 조치됩니다.");
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

  const { error } = await client.from("comments").insert([
    {
      post_id: currentPostIdForComment,
      user_email: myNickname,
      content: content,
    },
  ]);

  if (!error) {
    document.getElementById("commentInput").value = "";
    fetchComments(currentPostIdForComment);

    const { data: postData } = await client
      .from("posts")
      .select("author, dislikes_count")
      .eq("id", currentPostIdForComment)
      .single();
    await client
      .from("posts")
      .update({ dislikes_count: (postData.dislikes_count || 0) + 1 })
      .eq("id", currentPostIdForComment);

    if (postData.author !== myNickname) {
      await client.from("notifications").insert([
        {
          target_user: postData.author,
          actor_nickname: myNickname,
          type: "comment",
          post_id: currentPostIdForComment,
        },
      ]);
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

  const { data, error } = await client
    .from("notifications")
    .select("*")
    .eq("target_user", myNickname)
    .order("created_at", { ascending: false });

  if (error)
    return (notiList.innerHTML = renderNotificationState(
      "error",
      "오류가 발생했습니다.",
      "잠시 후 다시 확인해주세요.",
    ));
  if (!data?.length)
    return (notiList.innerHTML = renderNotificationState(
      "notifications_off",
      "새로운 알림이 없습니다.",
      "조용한 새벽처럼 아직 도착한 소식이 없어요.",
    ));

  notiList.innerHTML = data
    .map((n) => {
      let icon = "notifications";
      let iconClass = "";
      let text = "";
      const actor = escapeHtml(n.actor_nickname || "누군가");

      if (n.type === "like") {
        icon = "favorite";
        iconClass = "like";
        text = `<strong>${actor}</strong>님이 회원님의 글을 좋아합니다.`;
      } else if (n.type === "comment") {
        icon = "chat_bubble";
        iconClass = "comment";
        text = `<strong>${actor}</strong>님이 회원님의 글에 댓글을 남겼습니다.`;
      } else if (n.type === "follow") {
        icon = "person_add";
        iconClass = "follow";
        text = `<strong>${actor}</strong>님이 회원님을 팔로우하기 시작했습니다.`;
      } else {
        text = "새로운 알림이 도착했습니다.";
      }

      return `
      <div class="noti-item" role="listitem">
        <span class="material-symbols-outlined noti-icon ${iconClass}">${escapeHtml(icon)}</span>
        <div class="noti-content">
          <div class="noti-text">${text}</div>
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

  if (!content || content.length < 5)
    return alert("최소 5자 이상 작성해주세요.");
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

function updateCharCount() {
  document.getElementById("charCount").innerText =
    `${document.getElementById("postContent").value.length} / 300`;
}

function sharePost(encodedContent) {
  const text = decodeURIComponent(encodedContent);
  if (navigator.share) {
    navigator.share({ title: "글림", text: text });
  } else {
    alert("공유 기능을 지원하지 않는 환경입니다.");
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

async function reportPost(postId) {
  if (!confirm("이 글을 신고하시겠습니까?")) return;
  const { data } = await client
    .from("posts")
    .select("reports_count")
    .eq("id", postId)
    .single();
  await client
    .from("posts")
    .update({ reports_count: (data.reports_count || 0) + 1 })
    .eq("id", postId);
  alert("신고가 접수되었습니다.");
}

async function openNoticeSheet() {
  closeSheet("settingsSheet");
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
      <div onclick="viewNoticeDetail('${safeTitle}', '${dateStr}', '${safeText}')"
           style="background: #111; border-radius: 12px; padding: 20px; margin-bottom: 10px; border: 1px solid #222; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;">
        <div style="color: #eee; font-size: 1.05rem; font-family: 'Noto Serif KR', serif; font-weight: 300;">${title}</div>
        <span class="material-symbols-outlined" style="color: #555;">chevron_right</span>
      </div>
    `;
    })
    .join("");
}

function closeNoticeDetail() {
  switchTab("profile");
  openSheet("noticeSheet");
}

function viewNoticeDetail(title, date, content) {
  closeSheet("noticeSheet");
  document
    .querySelectorAll(".app-view")
    .forEach((view) => view.classList.remove("active"));
  document.getElementById("view-notice-detail").classList.add("active");

  const container = document.getElementById("noticeDetailContainer");
  container.innerHTML = `
    <div style="color: #fff; font-weight: 700; font-size: 1.6rem; margin-bottom: 15px; font-family: 'Noto Serif KR', serif;">${title}</div>
    <div style="color: #666; font-size: 0.9rem; margin-bottom: 40px; font-family: -apple-system, sans-serif; border-bottom: 1px solid #222; padding-bottom: 15px;">${date}</div>
    <div style="color: #eaeaea; font-size: 1.15rem; line-height: 1.8; font-family: 'Noto Serif KR', serif; font-weight: 300; word-break: keep-all;">${content}</div>
  `;
}

init();

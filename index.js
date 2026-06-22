const SUPABASE_URL = "https://qdnpeliqtxdglqewbvgg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mwYlhge63nnNjL9lAFhxRw_fxRtRGvO";
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
const contextPostCollections = new Map();
const contextPostTitles = new Map();

const observerOptions = {
  root: document.querySelector("#view-home"),
  threshold: 0.6,
};
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add("is-visible");
    else entry.target.classList.remove("is-visible");
  });
}, observerOptions);

const contextObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("is-visible");
      else entry.target.classList.remove("is-visible");
    });
  },
  { root: document.querySelector("#view-context-feed"), threshold: 0.6 },
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

function switchTab(tabName) {
  document.querySelector(".header")?.classList.remove("is-hidden");
  if (tabName === "write" && !currentUser) {
    alert("글을 작성하려면 로그인이 필요합니다.");
    switchTab("profile");
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
  ].forEach((sheetId) => {
      const sheet = document.getElementById(sheetId);
      let touchStartY = 0;
      let touchCurrentY = 0;
      let isDraggingSheet = false;
      sheet.addEventListener(
        "touchstart",
        (e) => {
          if (
            e.target.closest(".comment-list") ||
            e.target.closest(".profile-menu-row") ||
            e.target.closest("#noticeList") ||
            e.target.closest("#followList") ||
            e.target.closest("input")
          )
            return;
          touchStartY = e.touches[0].clientY;
          isDraggingSheet = false;
        },
        { passive: true },
      );
      sheet.addEventListener(
        "touchmove",
        (e) => {
          touchCurrentY = e.touches[0].clientY;
          const deltaY = touchCurrentY - touchStartY;
          if (deltaY > 0) {
            isDraggingSheet = true;
            sheet.style.transition = "none";
            sheet.style.transform = `translateY(${deltaY}px)`;
          }
        },
        { passive: true },
      );
      sheet.addEventListener("touchend", (e) => {
        if (!isDraggingSheet) return;
        const deltaY = touchCurrentY - touchStartY;
        sheet.style.transition =
          "bottom 0.4s cubic-bezier(0.25, 1, 0.5, 1), transform 0.2s ease";
        sheet.style.transform = "";
        if (deltaY > 100) closeSheet(sheetId);
        touchStartY = 0;
        touchCurrentY = 0;
        isDraggingSheet = false;
      });
  });

  setupSwipeBackNavigation();
  setupPullToRefresh();
}

function activateAppView(viewId) {
  document
    .querySelector(".header")
    ?.classList.toggle("is-hidden", viewId === "view-context-feed");
  document
    .querySelectorAll(".app-view")
    .forEach((view) => view.classList.remove("active"));
  document
    .querySelectorAll(".nav-item")
    .forEach((nav) => nav.classList.remove("active"));

  document.getElementById(viewId)?.classList.add("active");
  const tabName = viewId.replace("view-", "");
  document.getElementById(`nav-${tabName}`)?.classList.add("active");
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function showPullRefreshIndicator(distance) {
  if (isRefreshing) return;
  const indicator = document.getElementById("refreshIndicator");
  const icon = document.getElementById("refreshIndicatorIcon");
  const text = document.getElementById("refreshIndicatorText");
  indicator.classList.add("visible", "pulling");
  icon.style.transform = `rotate(${Math.min(distance * 2, 180)}deg)`;
  text.innerText = distance >= 80 ? "놓아서 새로고침" : "당겨서 새로고침";
  clearTimeout(pullIndicatorHideTimer);
  pullIndicatorHideTimer = setTimeout(forceHideRefreshIndicator, 1200);
}

function hidePullRefreshIndicator() {
  clearTimeout(pullIndicatorHideTimer);
  pullIndicatorHideTimer = null;
  if (isRefreshing) return;
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
  indicator.classList.remove("pulling", "complete");
  indicator.classList.add("visible", "refreshing");
  icon.style.transform = "";
  icon.innerText = "refresh";
  text.innerText = "새로고침 중...";
  view?.scrollTo({ top: 0, behavior: "smooth" });

  try {
    if (tabName === "home") {
      await fetchPosts();
    } else if (tabName === "explore") {
      await fetchExplorePosts(document.getElementById("searchInput").value.trim());
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
    icon.innerText = "check";
    text.innerText = "새로고침 완료";
    await wait(450);
  } finally {
    clearTimeout(refreshSafetyTimer);
    indicator.classList.remove("visible", "refreshing", "complete");
    icon.innerText = "refresh";
    icon.style.transform = "";
    resetRefreshViewPosition(view);
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
        view.style.transition = "none";
        view.style.transform = `translate3d(0, ${Math.min(deltaY * 0.22, 34)}px, 0)`;
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

function setViewedProfileAvatar(avatarUrl) {
  const avatar = document.getElementById("viewedProfileAvatar");
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
    icon.style.cssText = "font-size:3rem; color:#555;";
    icon.innerText = "person";
    avatar.appendChild(icon);
  }
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

  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  list.replaceChildren();
  userIds.forEach((id) => {
    const profile = profilesById.get(id);
    if (profile) list.appendChild(createFollowListRow(profile));
  });
}

function updateAuthUI() {
  const authContainer = document.getElementById("authContainer");
  const profileContainer = document.getElementById("profileContainer");

  if (currentUser) {
    authContainer.style.display = "none";
    profileContainer.style.display = "block";

    const displayName =
      currentUser.user_metadata?.random_nickname ||
      currentUser.email.split("@")[0];
    const displayId =
      currentUser.user_metadata?.custom_id || currentUser.email.split("@")[0];
    const avatarUrl = currentUser.user_metadata?.avatar_url;

    document.getElementById("profileName").innerText = displayName;
    document.getElementById("profileId").innerText = `@${displayId}`;

    if (avatarUrl) {
      document.getElementById("profileAvatar").innerHTML =
        `<img src="${avatarUrl}" style="width:100%; height:100%; object-fit:cover;">`;
    }

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

  document.getElementById("editNicknameInput").value = currentNick;
  document.getElementById("editIdInput").value = currentId;
  openSheet("editProfileSheet");
}

async function saveProfile() {
  if (!currentUser) return;
  const newNick = document.getElementById("editNicknameInput").value.trim();
  const newId = document.getElementById("editIdInput").value.trim();

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

  const { error } = await client.auth.updateUser({
    data: { random_nickname: newNick, custom_id: newId },
  });

  if (error) {
    alert("프로필 업데이트 중 오류가 발생했습니다.");
    return;
  }

  currentUser.user_metadata.random_nickname = newNick;
  currentUser.user_metadata.custom_id = newId;
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
  loadProfileGrid("my");
  fetchPosts();
  alert("프로필이 성공적으로 변경되었습니다.");
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
  const userKey = currentUser ? currentUser.id : "guest";
  const hasLiked = localStorage.getItem(`liked_${userKey}_${post.id}`)
    ? "font-variation-settings: 'FILL' 1; color: #ff3b30;"
    : "";
  const hasBookmarked = localStorage.getItem(
    `bookmarked_${userKey}_${post.id}`,
  )
    ? "font-variation-settings: 'FILL' 1; color: #FFCC00;"
    : "";
  const bookmarkText = localStorage.getItem(
    `bookmarked_${userKey}_${post.id}`,
  )
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
    contextObserver.observe(postElement);
  });

  requestAnimationFrame(() => {
    const targetPost = feed.children[startIndex];
    view.style.scrollBehavior = "auto";
    view.scrollTop = targetPost ? targetPost.offsetTop : 0;
    requestAnimationFrame(() => {
      view.style.scrollBehavior = "";
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

function addInteractiveSwipeBack(view, getPreviousViewId, onBack, options = {}) {
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
        view.style.transition =
          "transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)";
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
  const { data, error } = await client
    .from("posts")
    .select("*")
    .neq("author", "🚨글림 운영자")
    .order("created_at", { ascending: false });
  const feedContainer = document.getElementById("postFeed");
  if (error)
    return (feedContainer.innerHTML = `<div style="height:100vh; display:flex; justify-content:center; align-items:center;">데이터 오류</div>`);
  observer.disconnect();
  feedContainer.innerHTML = "";
  if (data.length === 0)
    return (feedContainer.innerHTML = `<div style="height:100vh; display:flex; justify-content:center; align-items:center; color:#555;">첫 번째 문장을 공유해 보세요.</div>`);

  data.forEach((post) => {
    const postElement = document.createElement("div");
    postElement.className = "post";
    const userKey = currentUser ? currentUser.id : "guest";
    const hasLiked = localStorage.getItem(`liked_${userKey}_${post.id}`)
      ? "font-variation-settings: 'FILL' 1; color: #ff3b30;"
      : "";
    const hasBookmarked = localStorage.getItem(
      `bookmarked_${userKey}_${post.id}`,
    )
      ? "font-variation-settings: 'FILL' 1; color: #FFCC00;"
      : "";
    const bookmarkText = localStorage.getItem(
      `bookmarked_${userKey}_${post.id}`,
    )
      ? "담김"
      : "저장";

    // ✅ 작성자 닉네임과 함께, 밑에 '몇 분 전' 등의 시간을 표시
    postElement.innerHTML = `
      <div class="text-content">${post.content.replace(/\n/g, "<br>")}</div>
      <div class="author-info">
        <div
          class="author-name${post.user_id ? " author-link" : ""}"
          ${post.user_id ? `onclick="openUserProfile('${post.user_id}')"` : ""}
        >${post.author || "익명"}</div>
        <div class="post-time">${timeForToday(post.created_at)}</div>
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
    feedContainer.appendChild(postElement);
    observer.observe(postElement);
  });
}

async function fetchExplorePosts(keyword = "") {
  const grid = document.getElementById("exploreGrid");
  contextPostCollections.set("explore", []);
  contextPostTitles.set(
    "explore",
    keyword ? `‘${keyword}’ 검색 결과` : "탐색 게시물",
  );
  grid.innerHTML =
    '<div style="grid-column: 1 / -1; padding: 50px 0; text-align: center; color: #555;">글을 불러오는 중...</div>';
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

async function fetchNotifications() {
  const notiList = document.getElementById("notiList");
  if (!currentUser) {
    notiList.innerHTML =
      '<div style="text-align: center; color: #555; padding: 50px 0;">로그인이 필요합니다.</div>';
    return;
  }

  notiList.innerHTML =
    '<div style="text-align: center; color: #555; padding: 50px 0;">알림을 불러오는 중...</div>';
  const myNickname = currentUser.user_metadata?.random_nickname;

  const { data, error } = await client
    .from("notifications")
    .select("*")
    .eq("target_user", myNickname)
    .order("created_at", { ascending: false });

  if (error)
    return (notiList.innerHTML =
      '<div style="text-align:center; color:#ff3b30; padding:50px;">오류가 발생했습니다.</div>');
  if (data.length === 0)
    return (notiList.innerHTML =
      '<div style="text-align:center; color:#555; padding:50px;">새로운 알림이 없습니다.</div>');

  notiList.innerHTML = data
    .map((n) => {
      let icon = "notifications";
      let iconClass = "";
      let text = "";

      if (n.type === "like") {
        icon = "favorite";
        iconClass = "like";
        text = `<strong>${n.actor_nickname}</strong>님이 회원님의 글을 좋아합니다.`;
      } else if (n.type === "comment") {
        icon = "chat_bubble";
        iconClass = "comment";
        text = `<strong>${n.actor_nickname}</strong>님이 회원님의 글에 댓글을 남겼습니다.`;
      } else if (n.type === "follow") {
        icon = "person_add";
        iconClass = "follow";
        text = `<strong>${n.actor_nickname}</strong>님이 회원님을 팔로우하기 시작했습니다.`;
      }

      // ✅ 알림 시간도 몇 분 전 양식 적용
      return `
      <div class="noti-item">
        <span class="material-symbols-outlined noti-icon ${iconClass}">${icon}</span>
        <div>
          <div class="noti-text">${text}</div>
          <div class="noti-time">${timeForToday(n.created_at)}</div>
        </div>
      </div>
    `;
    })
    .join("");
}

async function submitPost() {
  if (!currentUser) return switchTab("profile");
  const content = document.getElementById("postContent").value.trim();
  if (!content || content.length < 5)
    return alert("최소 5자 이상 작성해주세요.");

  const authorNickname =
    currentUser.user_metadata?.random_nickname ||
    currentUser.email.split("@")[0];

  const { error } = await client.from("posts").insert([
    {
      content: content,
      author: authorNickname,
      user_id: currentUser.id,
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

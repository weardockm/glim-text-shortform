const SUPABASE_URL = "https://qdnpeliqtxdglqewbvgg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mwYlhge63nnNjL9lAFhxRw_fxRtRGvO";
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentPostIdForComment = null;
let currentProfileTab = "my";

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

function switchTab(tabName) {
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
  if (tabName === "profile") {
    updateAuthUI();
    if (currentUser) loadProfileGrid(currentProfileTab);
  }
}

async function init() {
  const {
    data: { session },
  } = await client.auth.getSession();
  currentUser = session?.user || null;
  updateAuthUI();
  await fetchPosts();

  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    updateAuthUI();
  });

  // 바텀 시트 드래그 로직 공통 적용
  ["commentSheet", "settingsSheet"].forEach((sheetId) => {
    const sheet = document.getElementById(sheetId);
    let touchStartY = 0;
    let touchCurrentY = 0;
    let isDraggingSheet = false;
    sheet.addEventListener(
      "touchstart",
      (e) => {
        if (
          e.target.closest(".comment-list") ||
          e.target.closest(".profile-menu-row")
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
}

function updateAuthUI() {
  const authContainer = document.getElementById("authContainer");
  const profileContainer = document.getElementById("profileContainer");

  if (currentUser) {
    authContainer.style.display = "none";
    profileContainer.style.display = "block";

    const displayName =
      currentUser.user_metadata?.full_name ||
      currentUser.user_metadata?.name ||
      currentUser.email.split("@")[0];
    const displayId = currentUser.email.split("@")[0];
    const avatarUrl = currentUser.user_metadata?.avatar_url;

    document.getElementById("profileName").innerText = displayName;
    document.getElementById("profileId").innerText = `@${displayId}`;

    if (avatarUrl) {
      document.getElementById("profileAvatar").innerHTML =
        `<img src="${avatarUrl}" style="width:100%; height:100%; object-fit:cover;">`;
    }

    // 게시글 수 계산 (내가 쓴 글 개수)
    client
      .from("posts")
      .select("id", { count: "exact" })
      .eq("author", displayName)
      .then(({ count }) => {
        document.getElementById("statPosts").innerText = count || 0;
      });
  } else {
    authContainer.style.display = "block";
    profileContainer.style.display = "none";
  }
}

async function handleSocialLogin(provider) {
  const { error } = await client.auth.signInWithOAuth({
    provider: provider,
    options: { redirectTo: window.location.origin },
  });
  if (error) alert(provider + " 로그인 실패");
}

async function handleSignOut() {
  await client.auth.signOut();
  closeSheet("settingsSheet");
  alert("로그아웃 되었습니다.");
  switchTab("home");
}

/* 프로필 탭 기능 */
function switchProfileTab(tabType) {
  currentProfileTab = tabType;
  document
    .querySelectorAll(".p-tab")
    .forEach((t) => t.classList.remove("active"));
  document.getElementById(`tab-${tabType}`).classList.add("active");
  loadProfileGrid(tabType);
}

async function loadProfileGrid(tabType) {
  const grid = document.getElementById("profileGrid");
  grid.innerHTML =
    '<div style="grid-column: 1 / -1; padding: 50px 0; text-align: center; color: #555;">불러오는 중...</div>';

  let query = client
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });
  const userKey = currentUser.id;
  let targetIds = [];

  if (tabType === "my") {
    const displayName =
      currentUser.user_metadata?.full_name ||
      currentUser.user_metadata?.name ||
      currentUser.email.split("@")[0];
    query = query.eq("author", displayName);
  } else if (tabType === "bookmark") {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(`bookmarked_${userKey}_`))
        targetIds.push(key.replace(`bookmarked_${userKey}_`, ""));
    }
    if (targetIds.length === 0)
      return (grid.innerHTML =
        '<div style="grid-column: 1 / -1; text-align: center; color: #555; padding: 50px 0;">저장된 사유가 없습니다.</div>');
    query = query.in("id", targetIds);
  } else if (tabType === "like") {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(`liked_${userKey}_`))
        targetIds.push(key.replace(`liked_${userKey}_`, ""));
    }
    if (targetIds.length === 0)
      return (grid.innerHTML =
        '<div style="grid-column: 1 / -1; text-align: center; color: #555; padding: 50px 0;">좋아요한 사유가 없습니다.</div>');
    query = query.in("id", targetIds);
  }

  const { data, error } = await query;
  if (error)
    return (grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #ff3b30;">오류</div>`);
  if (data.length === 0)
    return (grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #555; padding: 50px 0;">기록이 없습니다.</div>`);

  grid.innerHTML = data
    .map(
      (post) => `
        <div class="grid-item" onclick="viewGridPost('${encodeURIComponent(post.content)}')">
            <div class="grid-text">${post.content}</div>
        </div>
    `,
    )
    .join("");
}

/* 게시물 관련 기능 (기존 동일 유지) */
async function fetchPosts() {
  const { data, error } = await client
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false });
  const feedContainer = document.getElementById("postFeed");
  if (error)
    return (feedContainer.innerHTML = `<div style="height:100vh; display:flex; justify-content:center; align-items:center;">데이터 오류</div>`);
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

    postElement.innerHTML = `
        <div class="text-content">${post.content.replace(/\n/g, "<br>")}</div>
        <div class="author-info"><div class="author-name">@${post.author || "익명"}</div></div>
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
        </div>`;
    feedContainer.appendChild(postElement);
    observer.observe(postElement);
  });
}

async function fetchExplorePosts(keyword = "") {
  const grid = document.getElementById("exploreGrid");
  grid.innerHTML =
    '<div style="grid-column: 1 / -1; padding: 50px 0; text-align: center; color: #555;">사유를 불러오는 중...</div>';
  let query = client
    .from("posts")
    .select("*")
    .order("likes_count", { ascending: false })
    .limit(30);
  if (keyword) query = query.ilike("content", `%${keyword}%`);

  const { data, error } = await query;
  if (error)
    return (grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #ff3b30;">오류</div>`);
  if (data.length === 0)
    return (grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: #555; padding: 50px 0;">결과 없음.</div>`);

  grid.innerHTML = data
    .map(
      (post) => `
        <div class="grid-item" onclick="viewGridPost('${encodeURIComponent(post.content)}')">
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
function viewGridPost(encodedContent) {
  alert(decodeURIComponent(encodedContent));
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
      const { data } = await client
        .from("posts")
        .select(column)
        .eq("id", postId)
        .single();
      await client
        .from("posts")
        .update({ [column]: (data[column] || 0) + 1 })
        .eq("id", postId);
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

/* 바텀 시트 통합 함수 */
function openSheet(id, postId = null) {
  if (id === "commentSheet") {
    currentPostIdForComment = postId;
    fetchComments(postId);
  }
  const sheet = document.getElementById(id);
  sheet.style.transition = "bottom 0.4s cubic-bezier(0.25, 1, 0.5, 1)";
  sheet.classList.add("open");
}

function closeSheet(id) {
  const sheet = document.getElementById(id);
  sheet.classList.remove("open");
  sheet.style.transform = "";
}

async function fetchComments(postId) {
  const list = document.getElementById("commentList");
  list.innerHTML =
    '<div style="text-align:center; color:#555; margin-top:20px;">사유를 가져오는 중...</div>';
  const { data, error } = await client
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) return (list.innerHTML = "오류 발생");
  if (data.length === 0)
    return (list.innerHTML =
      '<div style="text-align:center; color:#555; margin-top:20px;">첫 번째로 사유를 나누어 보세요.</div>');

  list.innerHTML = data
    .map((c) => {
      const authorName = c.user_email ? c.user_email.split("@")[0] : "익명";
      return `<div class="comment-item"><div class="comment-author">@${authorName}</div><div class="comment-text">${c.content}</div></div>`;
    })
    .join("");
  list.scrollTop = list.scrollHeight;
}

async function submitComment() {
  if (!currentUser) {
    alert("사유를 나누려면 로그인이 필요합니다.");
    closeSheet("commentSheet");
    switchTab("profile");
    return;
  }
  const content = document.getElementById("commentInput").value.trim();
  if (!content) return;

  const { error } = await client
    .from("comments")
    .insert([
      {
        post_id: currentPostIdForComment,
        user_email: currentUser.email,
        content: content,
      },
    ]);
  if (!error) {
    document.getElementById("commentInput").value = "";
    fetchComments(currentPostIdForComment);
    const { data } = await client
      .from("posts")
      .select("dislikes_count")
      .eq("id", currentPostIdForComment)
      .single();
    await client
      .from("posts")
      .update({ dislikes_count: (data.dislikes_count || 0) + 1 })
      .eq("id", currentPostIdForComment);
    fetchPosts();
  }
}

async function submitPost() {
  if (!currentUser) return switchTab("profile");
  const content = document.getElementById("postContent").value.trim();
  if (!content || content.length < 5)
    return alert("최소 5자 이상 작성해주세요.");

  const authorNickname =
    currentUser.user_metadata?.full_name ||
    currentUser.user_metadata?.name ||
    currentUser.email.split("@")[0];
  await client
    .from("posts")
    .insert([
      {
        content: content,
        author: authorNickname,
        likes_count: 0,
        dislikes_count: 0,
        reports_count: 0,
      },
    ]);

  document.getElementById("postContent").value = "";
  updateCharCount();
  switchTab("home");
}

function updateCharCount() {
  document.getElementById("charCount").innerText =
    `${document.getElementById("postContent").value.length} / 300`;
}

init();

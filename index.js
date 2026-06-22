const SUPABASE_URL = "https://qdnpeliqtxdglqewbvgg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mwYlhge63nnNjL9lAFhxRw_fxRtRGvO";
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentPostIdForComment = null; // 현재 댓글을 달고 있는 게시물 ID 기억

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
  // 💡 프로필 탭으로 갈 때마다 내가 쓴 글 업데이트
  if (tabName === "profile" && currentUser) fetchUserPosts();
}

async function init() {
  const {
    data: { session },
  } = await client.auth.getSession();
  currentUser = session?.user || null;
  updateAuthUI();
  fetchPosts();

  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    updateAuthUI();
  });
}

function updateAuthUI() {
  const authForm = document.getElementById("authForm");
  const profileInfo = document.getElementById("profileInfo");
  const authTitle = document.getElementById("authTitle");

  if (currentUser) {
    authForm.style.display = "none";
    profileInfo.style.display = "flex";
    profileInfo.style.flexDirection = "column";
    authTitle.innerText = "내 공간";

    const displayName =
      currentUser.user_metadata?.full_name ||
      currentUser.user_metadata?.name ||
      currentUser.email.split("@")[0];
    document.getElementById("userEmailDisplay").innerText =
      `@${displayName} 님`;

    // 로그인 상태면 내가 쓴 글 불러오기 실행
    fetchUserPosts();
  } else {
    authForm.style.display = "flex";
    profileInfo.style.display = "none";
    authTitle.innerText = "글림 시작하기";
    document.getElementById("myPostsList").innerHTML = ""; // 초기화
  }
}

// 소셜 및 이메일 로그인 로직 유지
async function handleSocialLogin(provider) {
  const { error } = await client.auth.signInWithOAuth({
    provider: provider,
    options: { redirectTo: window.location.origin },
  });
  if (error) alert(provider + " 로그인 중 오류가 발생했습니다.");
}

async function handleSignUp() {
  const email = document.getElementById("emailInput").value;
  const password = document.getElementById("passwordInput").value;
  if (!email || password.length < 6)
    return alert("이메일과 6자리 이상의 비밀번호를 입력해주세요.");
  const { error } = await client.auth.signUp({ email, password });
  if (error) alert("가입 오류: " + error.message);
  else alert("환영합니다! 가입이 완료되었습니다.");
}

async function handleSignIn() {
  const email = document.getElementById("emailInput").value;
  const password = document.getElementById("passwordInput").value;
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) alert("로그인 실패: 이메일이나 비밀번호를 확인해주세요.");
  else switchTab("home");
}

async function handleSignOut() {
  await client.auth.signOut();
  alert("로그아웃 되었습니다.");
  switchTab("home");
}

// 💡 1. [프로필] 내가 쓴 글 불러오기 & 삭제 기능
async function fetchUserPosts() {
  if (!currentUser) return;
  const displayName =
    currentUser.user_metadata?.full_name ||
    currentUser.user_metadata?.name ||
    currentUser.email.split("@")[0];

  const { data, error } = await client
    .from("posts")
    .select("*")
    .eq("author", displayName)
    .order("created_at", { ascending: false });
  const container = document.getElementById("myPostsList");

  if (error) {
    container.innerHTML = "불러오기 실패";
    return;
  }
  if (data.length === 0) {
    container.innerHTML =
      '<div class="coming-soon">아직 남긴 조각이 없습니다.</div>';
    return;
  }

  container.innerHTML = data
    .map(
      (post) => `
        <div class="my-post-item">
            <div class="my-post-content">${post.content}</div>
            <button class="delete-post-btn" onclick="deletePost('${post.id}')">삭제</button>
        </div>
    `,
    )
    .join("");
}

async function deletePost(postId) {
  if (!confirm("이 글을 영구적으로 삭제하시겠습니까?")) return;
  await client.from("posts").delete().eq("id", postId);
  fetchUserPosts(); // 리스트 새로고침
  fetchPosts(); // 홈 피드 새로고침
}

// 피드 가져오기
async function fetchPosts() {
  const { data, error } = await client
    .from("posts")
    .lt("reports_count", 5)
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
    // 💡 수정됨: 말풍선 아이콘 클릭 시 openCommentSheet 함수 실행
    postElement.innerHTML = `
        <div class="text-content">${post.content.replace(/\n/g, "<br>")}</div>
        <div class="author-info">
            <div class="author-name">@${post.author || "익명"}</div>
        </div>
        <div class="side-actions">
            <div class="action-btn" onclick="incrementMetric('${post.id}', 'likes_count', this)">
                <span class="material-symbols-outlined icon-like">favorite</span>
                <span class="action-count">${post.likes_count || 0}</span>
            </div>
            <div class="action-btn" onclick="openCommentSheet('${post.id}')">
                <span class="material-symbols-outlined">chat_bubble</span>
                <span class="action-count">${post.dislikes_count || 0}</span>
            </div>
            <div class="action-btn" onclick="sharePost('${post.id}')">
                <span class="material-symbols-outlined">share</span>
                <span class="action-count">공유</span>
            </div>
            <div class="action-btn report-btn" onclick="reportPost('${post.id}')" title="신고">
                <span class="material-symbols-outlined">flag</span>
            </div>
        </div>`;
    feedContainer.appendChild(postElement);
    observer.observe(postElement);
  });
}

// 💡 2. [댓글] 댓글창 열고 닫기 및 댓글 데이터 연동
function openCommentSheet(postId) {
  currentPostIdForComment = postId;
  document.getElementById("commentSheet").classList.add("open");
  fetchComments(postId);
}

function closeSheet(id) {
  document.getElementById(id).classList.remove("open");
}

async function fetchComments(postId) {
  const list = document.getElementById("commentList");
  list.innerHTML = '<div class="coming-soon">댓글을 불러오는 중...</div>';

  const { data, error } = await client
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) {
    list.innerHTML = "오류 발생";
    return;
  }
  if (data.length === 0) {
    list.innerHTML =
      '<div class="coming-soon">첫 번째로 사유를 나누어 보세요.</div>';
    return;
  }

  list.innerHTML = data
    .map(
      (c) => `
        <div class="comment-item">
            <div class="comment-author">@${c.user_email.split("@")[0]}</div>
            <div class="comment-text">${c.content}</div>
        </div>
    `,
    )
    .join("");

  // 스크롤 맨 아래로 이동
  list.scrollTop = list.scrollHeight;
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

  // 댓글 테이블에 저장
  const { error } = await client.from("comments").insert([
    {
      post_id: currentPostIdForComment,
      user_email: currentUser.email, // 댓글 작성자 이메일 저장
      content: content,
    },
  ]);

  if (!error) {
    document.getElementById("commentInput").value = ""; // 입력창 비우기
    fetchComments(currentPostIdForComment); // 댓글 리스트 갱신

    // 기존 게시물 테이블의 댓글 숫자(dislikes_count를 활용) 1 증가
    const { data } = await client
      .from("posts")
      .select("dislikes_count")
      .eq("id", currentPostIdForComment)
      .single();
    await client
      .from("posts")
      .update({ dislikes_count: (data.dislikes_count || 0) + 1 })
      .eq("id", currentPostIdForComment);
    fetchPosts(); // 뒤의 홈 화면 숫자도 갱신
  } else {
    alert("댓글 등록에 실패했습니다.");
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
  const { error } = await client
    .from("posts")
    .insert([{ content: content, author: authorNickname }]);

  if (error) alert("등록에 실패했습니다.");
  else {
    document.getElementById("postContent").value = "";
    updateCharCount();
    switchTab("home");
  }
}

async function incrementMetric(postId, column, element) {
  const countSpan = element.querySelector(".action-count");
  countSpan.innerText = parseInt(countSpan.innerText) + 1;
  if (column === "likes_count") {
    const icon = element.querySelector(".icon-like");
    icon.style.fontVariationSettings = "'FILL' 1";
    icon.style.color = "#ff3b30";
  }
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

function sharePost(postId) {
  const url = window.location.href.split("?")[0] + "?post=" + postId;
  if (navigator.share)
    navigator
      .share({ title: "글림", text: "이 깊은 문장을 확인해보세요.", url: url })
      .catch(console.error);
  else
    navigator.clipboard
      .writeText(url)
      .then(() => alert("링크가 복사되었습니다."));
}

async function reportPost(postId) {
  if (!confirm("이 문장을 신고하시겠습니까?")) return;
  const { data } = await client
    .from("posts")
    .select("reports_count")
    .eq("id", postId)
    .single();
  await client
    .from("posts")
    .update({ reports_count: (data.reports_count || 0) + 1 })
    .eq("id", postId);
  alert("신고 접수 완료");
  fetchPosts();
}

function updateCharCount() {
  document.getElementById("charCount").innerText =
    `${document.getElementById("postContent").value.length} / 300`;
}

init();

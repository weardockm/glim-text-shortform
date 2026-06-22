const SUPABASE_URL = "https://qdnpeliqtxdglqewbvgg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mwYlhge63nnNjL9lAFhxRw_fxRtRGvO";
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 🚨 이곳에 대표님의 이메일을 정확히 입력하세요!
const ADMIN_EMAIL = "weardockm@gmail.com";

async function initAdmin() {
  const {
    data: { session },
  } = await client.auth.getSession();
  const currentUser = session?.user || null;

  // 강력한 보안 로직: 로그인을 안 했거나, 이메일이 관리자가 아니면 강제 추방
  if (!currentUser || currentUser.email !== ADMIN_EMAIL) {
    alert("접근 권한이 없습니다. (관리자 전용 구역)");
    window.location.href = "index.html";
    return;
  }

  // 관리자가 맞으면 리스트 불러오기
  fetchAdminReports();
}

async function fetchAdminReports() {
  const container = document.getElementById("adminReportList");

  // 신고가 1번이라도 들어온 글을 내림차순으로 가져옵니다.
  const { data, error } = await client
    .from("posts")
    .select("*")
    .gt("reports_count", 0)
    .order("reports_count", { ascending: false });

  if (error) {
    container.innerHTML = "데이터 로드 실패: " + error.message;
    return;
  }
  if (data.length === 0) {
    container.innerHTML =
      '<div class="coming-soon" style="color: #34A853;">🚨 깨끗합니다.<br>신고가 접수된 유해 게시물이 없습니다.</div>';
    return;
  }

  container.innerHTML = data
    .map(
      (post) => `
        <div class="my-post-item">
            <div style="width: 75%;">
                <div class="report-tag">🔥 누적 신고 횟수: ${post.reports_count}회</div>
                <div class="my-post-content">${post.content}</div>
                <div style="font-size: 0.8rem; color: #888;">작성자: @${post.author}</div>
            </div>
            <button class="delete-post-btn" onclick="deletePost('${post.id}')">즉시 처분</button>
        </div>
    `,
    )
    .join("");
}

async function deletePost(postId) {
  if (!confirm("이 글을 영구적으로 삭제하시겠습니까?")) return;
  await client.from("posts").delete().eq("id", postId);
  alert("처분 완료되었습니다.");
  fetchAdminReports(); // 리스트 갱신
}

initAdmin();

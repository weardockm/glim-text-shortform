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
  fetchAdminNotices();
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

// 📢 작성된 공지사항 리스트 불러오기 & 삭제 기능
async function fetchAdminNotices() {
  const container = document.getElementById("adminNoticeList");

  const { data, error } = await client
    .from("posts")
    .select("*")
    .eq("author", "🚨글림 운영자")
    .order("created_at", { ascending: false });

  if (error) {
    container.innerHTML = "데이터 로드 실패";
    return;
  }
  if (data.length === 0) {
    container.innerHTML =
      '<div class="coming-soon">등록된 공지사항이 없습니다.</div>';
    return;
  }

  container.innerHTML = data
    .map((post) => {
      let title = "공지사항";
      if (post.content.startsWith("[공지]")) {
        const parts = post.content.replace("[공지]", "").split("|||");
        if (parts.length === 2) title = parts[0];
      }

      return `
      <div class="my-post-item" style="border-color: #333; background: #111;">
          <div style="width: 75%;">
              <div style="color: #fff; font-size: 1.1rem; font-weight: bold; margin-bottom: 8px;">${title}</div>
              <div style="font-size: 0.85rem; color: #888;">작성일: ${new Date(post.created_at).toLocaleDateString()}</div>
          </div>
          <button class="delete-post-btn" style="background: #444;" onclick="deleteNotice('${post.id}')">삭제</button>
      </div>
    `;
    })
    .join("");
}

async function deleteNotice(postId) {
  if (!confirm("이 공지사항을 삭제하시겠습니까?")) return;
  await client.from("posts").delete().eq("id", postId);
  alert("공지사항이 삭제되었습니다.");
  fetchAdminNotices(); // 리스트 새로고침
}

// 📢 새로운 공지사항 작성 기능 (제목 + 내용 분리 저장)
async function submitNotice() {
  const title = document.getElementById("adminNoticeTitle").value.trim();
  const content = document.getElementById("adminNoticeContent").value.trim();

  if (!title || !content) {
    alert("제목과 내용을 모두 입력해주세요.");
    return;
  }

  if (!confirm("공지사항을 등록하시겠습니까?")) return;

  // DB에 저장할 때 구분자(|||)를 두어 제목과 내용을 분리 저장
  const { error } = await client.from("posts").insert([
    {
      content: "[공지]" + title + "|||" + content,
      author: "🚨글림 운영자",
      likes_count: 0,
      dislikes_count: 0,
      reports_count: 0,
    },
  ]);

  if (error) {
    alert("공지 등록 중 오류가 발생했습니다: " + error.message);
  } else {
    alert("공지사항이 성공적으로 등록되었습니다!");
    document.getElementById("adminNoticeTitle").value = ""; // 제목 비우기
    document.getElementById("adminNoticeContent").value = ""; // 내용 비우기
  }
}

function setupAdminSwipeBack() {
  let touchStartX = 0;
  let touchStartY = 0;
  let swipeDistance = 0;
  let isDragging = false;

  document.addEventListener(
    "touchstart",
    (event) => {
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
      swipeDistance = 0;
      isDragging = false;
    },
    { passive: true },
  );

  document.addEventListener(
    "touchmove",
    (event) => {
      const deltaX = event.touches[0].clientX - touchStartX;
      const deltaY = event.touches[0].clientY - touchStartY;
      if (deltaX <= 0 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.1) return;
      event.preventDefault();
      isDragging = true;
      swipeDistance = Math.min(deltaX, window.innerWidth);
      document.body.style.transition = "none";
      document.body.style.transform = `translate3d(${swipeDistance}px, 0, 0)`;
    },
    { passive: false },
  );

  document.addEventListener(
    "touchend",
    (event) => {
      if (!isDragging) return;
      swipeDistance = Math.max(
        0,
        Math.min(
          event.changedTouches[0].clientX - touchStartX,
          window.innerWidth,
        ),
      );
      document.body.style.transition =
        "transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)";
      if (swipeDistance > window.innerWidth * 0.5) {
        document.body.style.transform = "translate3d(100vw, 0, 0)";
        setTimeout(() => {
          window.location.href = "index.html";
        }, 230);
      } else {
        document.body.style.transform = "translate3d(0, 0, 0)";
        setTimeout(() => {
          document.body.style.transition = "";
          document.body.style.transform = "";
        }, 230);
      }
    },
    { passive: true },
  );

  document.addEventListener(
    "touchcancel",
    () => {
      document.body.style.transition =
        "transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)";
      document.body.style.transform = "translate3d(0, 0, 0)";
      setTimeout(() => {
        document.body.style.transition = "";
        document.body.style.transform = "";
      }, 230);
    },
    { passive: true },
  );
}

setupAdminSwipeBack();
initAdmin();

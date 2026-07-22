const SUPABASE_URL = "https://qdnpeliqtxdglqewbvgg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_mwYlhge63nnNjL9lAFhxRw_fxRtRGvO";
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BGM_MAX_FILE_SIZE = 20 * 1024 * 1024;
const BGM_ALLOWED_FILE_TYPE = "audio/mpeg";
const BGM_CATEGORIES = new Set(["잔잔한", "감성", "신나는", "몽환적인", "집중"]);
function reportAdminDiagnostic(context, detail = null) {
  const diagnostic = { context };
  if (detail && typeof detail === "object") {
    if (typeof detail.name === "string") diagnostic.name = detail.name;
    if (typeof detail.code === "string") diagnostic.code = detail.code;
    if (Number.isInteger(detail.status)) diagnostic.status = detail.status;
  }
  console.warn("[glim-admin]", diagnostic);
}

function goToHome() {
  window.location.assign(new URL("index.html", window.location.href).href);
}

function setupAdminEventHandlers() {
  document.addEventListener("click", (event) => {
    const actionElement = event.target.closest?.("[data-admin-click]");
    if (!actionElement) return;
    const action = actionElement.dataset.adminClick;
    if (action === "go-home") {
      goToHome();
    } else if (action === "submit-notice") {
      submitNotice();
    } else {
      reportAdminDiagnostic("unknown-action", {
        code: action ? "unknown" : "missing",
      });
    }
  });
  document.getElementById("adminBgmForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitBgmTrack();
  });
}
const REPORT_REASON_LABELS = Object.freeze({
  spam: "스팸 또는 광고",
  harassment: "괴롭힘 또는 모욕",
  hate: "혐오 표현",
  sexual: "성적인 콘텐츠",
  violence: "폭력적이거나 위험한 내용",
  personal_info: "개인정보 노출",
  other: "기타",
});
const REPORT_TARGET_LABELS = Object.freeze({
  post: "게시글",
  comment: "댓글",
  user: "사용자",
});
const APPEAL_STATUS_LABELS = Object.freeze({
  none: "이의제기 없음",
  requested: "이의제기 요청됨",
  accepted: "이의제기 수용",
  rejected: "이의제기 기각",
});

function formatAdminDate(value) {
  if (!value) return "없음";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "없음" : date.toLocaleString();
}

function isOverdue(value) {
  if (!value) return false;
  const dueAt = new Date(value).getTime();
  return Number.isFinite(dueAt) && dueAt < Date.now();
}

function createReportMetaRow(label, value) {
  const row = document.createElement("div");
  const labelElement = document.createElement("strong");
  labelElement.textContent = label;
  row.append(labelElement, document.createTextNode(` ${value}`));
  return row;
}

async function initAdmin() {
  const {
    data: { session },
  } = await client.auth.getSession();
  const currentUser = session?.user || null;
  const { data: isModerator, error: roleError } = currentUser
    ? await client.rpc("is_moderator")
    : { data: false, error: null };

  if (!currentUser || roleError || !isModerator) {
    if (roleError) reportAdminDiagnostic("moderator-role-check", roleError);
    alert("접근 권한이 없습니다. (관리자 전용 구역)");
    goToHome();
    return;
  }

  await Promise.all([
    fetchAdminReports(),
    fetchAdminNotices(),
    fetchAdminBgmTracks(),
  ]);
}

function createBgmTrackCard(track) {
  const card = document.createElement("div");
  card.className = "bgm-track-card";
  const info = document.createElement("div");
  const title = document.createElement("div");
  title.className = "bgm-track-title";
  title.textContent = String(track.title || "제목 없음");
  const category = document.createElement("span");
  category.className = "bgm-track-category";
  category.textContent = BGM_CATEGORIES.has(track.category) ? track.category : "잔잔한";
  const artist = document.createElement("div");
  artist.className = "bgm-track-artist";
  artist.textContent = String(track.artist || "아티스트 미상");
  info.append(title, category, artist);

  const statusButton = document.createElement("button");
  statusButton.type = "button";
  statusButton.className = `bgm-status-btn${track.is_active ? "" : " is-inactive"}`;
  statusButton.textContent = track.is_active ? "공개 중" : "숨김";
  statusButton.setAttribute(
    "aria-label",
    `${title.textContent} ${track.is_active ? "숨기기" : "공개하기"}`,
  );
  statusButton.addEventListener("click", () => {
    void setBgmTrackActive(track.id, !track.is_active);
  });
  card.append(info, statusButton);
  return card;
}

async function fetchAdminBgmTracks() {
  const container = document.getElementById("adminBgmList");
  const { data, error } = await client.rpc("list_bgm_tracks_for_moderation");
  if (error) {
    reportAdminDiagnostic("bgm-catalog-load", error);
    container.textContent = "음악 목록을 불러오지 못했습니다.";
    return;
  }
  if (!data?.length) {
    container.textContent = "등록된 음악이 없습니다.";
    return;
  }
  container.replaceChildren(...data.map(createBgmTrackCard));
}

async function setBgmTrackActive(trackId, isActive) {
  const { error } = await client
    .from("bgm_tracks")
    .update({ is_active: isActive })
    .eq("id", trackId);
  if (error) {
    alert("음악 공개 상태를 변경하지 못했습니다: " + error.message);
    return;
  }
  await fetchAdminBgmTracks();
}

async function submitBgmTrack() {
  const form = document.getElementById("adminBgmForm");
  const submitButton = document.getElementById("adminBgmSubmit");
  const title = document.getElementById("adminBgmTrackTitle").value.trim();
  const artist = document.getElementById("adminBgmArtist").value.trim();
  const category = document.getElementById("adminBgmCategory").value;
  const file = document.getElementById("adminBgmFile").files?.[0];
  if (!title || !artist || !BGM_CATEGORIES.has(category) || !file) {
    alert("곡 제목, 아티스트, 카테고리, MP3 파일을 모두 입력해주세요.");
    return;
  }
  if (file.type !== BGM_ALLOWED_FILE_TYPE || !file.name.toLowerCase().endsWith(".mp3")) {
    alert("MP3 파일만 등록할 수 있습니다.");
    return;
  }
  if (file.size > BGM_MAX_FILE_SIZE) {
    alert("음악 파일은 20MB 이하만 등록할 수 있습니다.");
    return;
  }

  const storagePath = `${crypto.randomUUID()}.mp3`;
  submitButton.disabled = true;
  submitButton.textContent = "등록 중...";
  try {
    const { error: uploadError } = await client.storage.from("bgm").upload(
      storagePath,
      file,
      { contentType: BGM_ALLOWED_FILE_TYPE, upsert: false },
    );
    if (uploadError) throw uploadError;
    const { error: catalogError } = await client.from("bgm_tracks").insert({
      storage_path: storagePath,
      title,
      artist,
      category,
    });
    if (catalogError) {
      await client.storage.from("bgm").remove([storagePath]);
      throw catalogError;
    }
    form.reset();
    await fetchAdminBgmTracks();
    alert("음악이 등록되었습니다. 앱의 음악 선택 목록에 바로 표시됩니다.");
  } catch (error) {
    reportAdminDiagnostic("bgm-catalog-create", error);
    alert("음악을 등록하지 못했습니다: " + (error?.message || "알 수 없는 오류"));
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "음악 등록하기";
  }
}

async function fetchAdminReports() {
  const container = document.getElementById("adminReportList");
  const { data, error } = await client
    .from("reports")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    reportAdminDiagnostic("reports-load", error);
    container.textContent = "신고 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.";
    return;
  }
  if (data.length === 0) {
    container.innerHTML =
      '<div class="coming-soon" style="color: #34A853;">검토를 기다리는 신고가 없습니다.</div>';
    return;
  }

  const reportItems = data.map((report) => {
    const item = document.createElement("div");
    item.className = "report-review-card";

    const head = document.createElement("div");
    head.className = "report-review-head";
    const type = document.createElement("span");
    type.className = "report-target-badge";
    type.textContent = REPORT_TARGET_LABELS[report.target_type] || "콘텐츠";
    const date = document.createElement("span");
    date.className = "report-review-date";
    date.textContent = new Date(report.created_at).toLocaleString();
    head.append(type, date);

    const reason = document.createElement("div");
    reason.className = "report-review-reason";
    reason.textContent =
      REPORT_REASON_LABELS[report.reason] || "기타 신고";

    const content = document.createElement("div");
    content.className = "report-review-content";
    content.textContent = String(report.content_snapshot || "내용 없음");

    const author = document.createElement("div");
    author.className = "report-review-author";
    author.textContent = `대상 작성자: @${report.author_snapshot || "알 수 없음"}`;

    item.append(head, reason, content, author);

    if (report.details) {
      const details = document.createElement("div");
      details.className = "report-review-details";
      details.textContent = `신고 설명: ${report.details}`;
      item.appendChild(details);
    }

    const meta = document.createElement("div");
    meta.className = "report-review-meta";
    if (isOverdue(report.review_due_at)) meta.classList.add("is-overdue");
    const moderationState = createReportMetaRow(
      "검토 SLA",
      formatAdminDate(report.review_due_at),
    );
    const appealState = createReportMetaRow(
      "이의제기",
      APPEAL_STATUS_LABELS[report.appeal_status] || "상태 미확인",
    );
    const quarantineState = createReportMetaRow(
      "격리/보존",
      `상태 ${report.status || "pending"} · 보존 ${formatAdminDate(
        report.retention_until,
      )}`,
    );
    meta.append(moderationState, appealState, quarantineState);
    item.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "report-review-actions";
    actions.appendChild(
      createModerationButton("기각", "dismiss", report.id, "secondary"),
    );
    if (report.target_type !== "user") {
      actions.appendChild(
        createModerationButton(
          "격리",
          "quarantine_content",
          report.id,
          "warning",
        ),
      );
      actions.appendChild(
        createModerationButton(
          "콘텐츠 삭제",
          "delete_content",
          report.id,
          "danger",
        ),
      );
    }
    actions.append(
      createModerationButton("7일 정지", "suspend_7d", report.id, "warning"),
      createModerationButton("영구 정지", "ban_user", report.id, "danger"),
    );
    item.appendChild(actions);
    return item;
  });
  container.replaceChildren(...reportItems);
}

function createModerationButton(label, action, reportId, variant) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `moderation-action-btn ${variant}`;
  button.textContent = label;
  button.addEventListener("click", () =>
    reviewReport(reportId, action, label),
  );
  return button;
}

async function reviewReport(reportId, action, actionLabel) {
  if (!confirm(`이 신고를 ‘${actionLabel}’ 처리하시겠습니까?`)) return;

  const { error } = await client.rpc("moderate_report", {
    moderation_report_id: reportId,
    moderation_action: action,
    moderation_note: "",
  });
  if (error) {
    alert("신고 처리에 실패했습니다: " + error.message);
    return;
  }

  alert(`‘${actionLabel}’ 처리가 완료되었습니다.`);
  fetchAdminReports();
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

  const noticeItems = data.map((post) => {
    let title = "공지사항";
    const postContent = String(post.content ?? "");
    if (postContent.startsWith("[공지]")) {
      const parts = postContent.replace("[공지]", "").split("|||");
      if (parts.length === 2) [title] = parts;
    }

    const item = document.createElement("div");
    item.className = "my-post-item";
    item.style.cssText = "border-color:#333; background:#111;";

    const info = document.createElement("div");
    info.style.width = "75%";

    const titleElement = document.createElement("div");
    titleElement.style.cssText =
      "color:#fff; font-size:1.1rem; font-weight:bold; margin-bottom:8px;";
    titleElement.textContent = title;

    const dateElement = document.createElement("div");
    dateElement.style.cssText = "font-size:0.85rem; color:#888;";
    dateElement.textContent = `작성일: ${new Date(post.created_at).toLocaleDateString()}`;

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-post-btn";
    deleteButton.type = "button";
    deleteButton.style.background = "#444";
    deleteButton.textContent = "삭제";
    deleteButton.addEventListener("click", () => deleteNotice(post.id));

    info.append(titleElement, dateElement);
    item.append(info, deleteButton);
    return item;
  });
  container.replaceChildren(...noticeItems);
}

async function deleteNotice(postId) {
  if (!confirm("이 공지사항을 삭제하시겠습니까?")) return;
  const { error } = await client.rpc("delete_operator_notice", {
    notice_post_id: postId,
  });
  if (error) {
    alert("공지사항을 삭제하지 못했습니다: " + error.message);
    return;
  }
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

  const { data: noticeId, error } = await client.rpc(
    "create_operator_notice",
    {
      notice_title: title,
      notice_content: content,
    },
  );

  if (error) {
    alert("공지 등록 중 오류가 발생했습니다: " + error.message);
  } else {
    const { error: pushError } = await client.functions.invoke("send-push", {
      body: {
        broadcast: true,
        category: "announcements",
        postId: noticeId,
        title,
      },
    });
    alert(
      pushError
        ? "공지는 등록됐지만 푸시 발송에 실패했습니다: " + pushError.message
        : "공지사항을 등록하고 푸시 알림을 발송했습니다!",
    );
    document.getElementById("adminNoticeTitle").value = ""; // 제목 비우기
    document.getElementById("adminNoticeContent").value = ""; // 내용 비우기
    fetchAdminNotices();
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
          goToHome();
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
setupAdminEventHandlers();
initAdmin();

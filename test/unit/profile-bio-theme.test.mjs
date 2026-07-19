import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const addMigrationPath = path.resolve(
  "supabase/migrations/20260708020000_add_profile_bio_theme.sql",
);
const defaultOnlyMigrationPath = path.resolve(
  "supabase/migrations/20260708023000_force_default_profile_theme.sql",
);
const identityRulesMigrationPath = path.resolve(
  "supabase/migrations/20260719020000_profile_identity_rules.sql",
);

test("profile bio migration extends public profile fields and default-only migration locks theme", async () => {
  const addSource = await readFile(addMigrationPath, "utf8");
  const defaultOnlySource = await readFile(defaultOnlyMigrationPath, "utf8");
  const commentDeleteGrantSource = await readFile(
    path.resolve("supabase/migrations/20260708024500_grant_comment_delete.sql"),
    "utf8",
  );

  assert.match(addSource, /alter table public\.profiles\s+add column if not exists bio text/u);
  assert.match(addSource, /alter table public\.profiles\s+add column if not exists theme text not null default 'default'/u);
  assert.match(addSource, /char_length\(coalesce\(bio, ''\)\) <= 60/u);
  assert.match(
    addSource,
    /grant select \(id, nickname, custom_id, avatar_url, bio, theme, updated_at\)\s+on public\.profiles\s+to anon, authenticated;/u,
  );
  assert.match(
    addSource,
    /grant update \(nickname, custom_id, avatar_url, bio, theme, updated_at\)\s+on public\.profiles\s+to authenticated;/u,
  );
  assert.doesNotMatch(addSource, /drop policy|create policy|delete_user_data|service_role client/iu);

  assert.match(defaultOnlySource, /update public\.profiles\s+set theme = 'default'/u);
  assert.match(defaultOnlySource, /alter table public\.profiles\s+alter column theme set default 'default'/u);
  assert.match(defaultOnlySource, /check \(theme = 'default'\)/u);
  assert.doesNotMatch(defaultOnlySource, /create policy|delete_user_data|service_role client/iu);

  assert.match(commentDeleteGrantSource, /grant delete\s+on table public\.comments\s+to authenticated;/u);
  assert.doesNotMatch(commentDeleteGrantSource, /drop policy|disable row level security|service_role/iu);
});

test("profile edit surface keeps bio controls and a default-only theme picker", async () => {
  const html = await readFile(path.resolve("index.html"), "utf8");
  const js = await readFile(path.resolve("index.js"), "utf8");

  assert.match(html, /id="editBioInput"/u);
  assert.match(html, /maxlength="60"/u);
  assert.match(html, /class="profile-theme-options"/u);
  assert.match(html, /data-profile-theme-option="default"/u);
  assert.match(html, /profile-theme-option-check/u);
  assert.doesNotMatch(html, /data-profile-theme-option="lofi_night"|data-profile-theme-option="vintage_analog"/u);
  assert.doesNotMatch(html, /로파이 나이트|빈티지 아날로그/u);
  assert.match(html, /id="profileBio"/u);
  assert.match(html, /id="viewedProfileBio"/u);

  assert.match(js, /const PROFILE_THEMES = Object\.freeze/u);
  assert.match(js, /function normalizeProfileBio/u);
  assert.match(js, /function setSelectedProfileTheme/u);
  assert.match(js, /\.select\("nickname, custom_id, avatar_url, bio, theme"\)/u);
  assert.match(js, /applyViewedProfileTheme\(profile\.theme\)/u);
  assert.doesNotMatch(js, /profileBio\.innerHTML|viewedProfileBio\.innerHTML/u);
});

test("profile identity rules keep only IDs unique and align UI with database limits", async () => {
  const html = await readFile(path.resolve("index.html"), "utf8");
  const js = await readFile(path.resolve("index.js"), "utf8");
  const migration = await readFile(identityRulesMigrationPath, "utf8");

  assert.match(html, /id="editNicknameInput"[\s\S]*?maxlength="15"/u);
  assert.match(html, /id="editIdInput"[\s\S]*?maxlength="20"/u);
  assert.match(
    html,
    /id="editNicknameInput"[\s\S]*?maxlength="15"[\s\S]*?\/>\s*<p class="edit-profile-field-hint">닉네임은 2~15자/u,
  );
  assert.match(
    html,
    /id="editIdInput"[\s\S]*?maxlength="20"[\s\S]*?\/>\s*<p class="edit-profile-field-hint">아이디는 3~20자/u,
  );
  assert.doesNotMatch(
    html,
    /class="profile-theme-options"[^>]*>\s*<p class="edit-profile-field-hint">/u,
  );
  assert.match(
    html,
    /html\[data-theme="light"\] \.profile-theme-option\.is-selected[\s\S]*?color: #312c29/u,
  );
  assert.match(js, /PROFILE_NICKNAME_MAX_LENGTH = 15/u);
  assert.match(
    js,
    /error\.code === "23505" \? "이미 사용 중인 아이디입니다\."/u,
  );
  assert.match(js, /PROFILE_ID_MAX_LENGTH = 20/u);
  assert.match(js, /data-glim-touch/u);

  assert.match(migration, /drop index if exists public\.profiles_nickname_key/u);
  assert.match(
    migration,
    /create unique index if not exists profiles_custom_id_key[\s\S]*?on public\.profiles \(custom_id\)/u,
  );
  assert.match(migration, /char_length\(new\.nickname\) > 15/u);
  assert.match(migration, /char_length\(coalesce\(new\.custom_id, ''\)\) > 20/u);
  assert.match(migration, /nickname_match_count = 1/u);
});

test("own profile normalizes legacy themes to the default class only", async () => {
  const html = await readFile(path.resolve("index.html"), "utf8");
  const js = await readFile(path.resolve("index.js"), "utf8");

  assert.match(js, /const PROFILE_THEME_VIEW_CLASSES = Object\.freeze/u);
  assert.match(js, /function applyOwnProfileTheme/u);
  assert.match(js, /applyOwnProfileTheme\(currentProfileTheme\)/u);
  assert.match(js, /getSafeProfileTheme\(theme\)/u);
  assert.doesNotMatch(html, /#view-profile\.profile-theme-lofi-night|#view-profile\.profile-theme-vintage-analog/u);
});

test("profile swipe-back underlay synchronizes login state before reveal", async () => {
  const js = await readFile(path.resolve("index.js"), "utf8");

  assert.match(js, /function prepareSwipeBackUnderlay/u);
  assert.match(js, /if \(previousView\?\.id === "view-profile"\) updateAuthUI\(\);/u);
  assert.match(
    js,
    /prepareSwipeBackUnderlay\(previousView\);\s*isDragging = true;[\s\S]*?previousView\.classList\.add\("swipe-back-underlay"\)/u,
  );
});

test("comment sheet uses the real source post instead of a cloned preview", async () => {
  const html = await readFile(path.resolve("index.html"), "utf8");
  const js = await readFile(path.resolve("index.js"), "utf8");

  assert.doesNotMatch(html, /commentPostPreview/u);
  assert.doesNotMatch(html, /comment-post-stage/u);
  assert.match(html, /contenteditable="true"/u);
  assert.match(html, /data-placeholder="따뜻한 댓글을 남겨주세요."/u);
  assert.match(html, /\.comment-sheet\.is-input-focused/u);
  assert.match(html, /\.post\.is-comment-source/u);
  assert.match(html, /--comment-source-y/u);
  assert.doesNotMatch(js, /cloneNode\(true\)/u);
  assert.doesNotMatch(js, /comment-post-clone/u);
  assert.doesNotMatch(js, /renderCommentPostPreview/u);
  assert.doesNotMatch(js, /commentPostPreview/u);
  assert.match(js, /function setCommentSourcePost/u);
  assert.match(js, /function updateCommentSourcePostMotion/u);
  assert.match(js, /function clearCommentSourcePost/u);
  assert.match(js, /function getCommentInputContent/u);
  assert.match(js, /function setupCommentInputFocusState/u);
  assert.match(js, /function setupCommentSheetDragInteractions/u);
  assert.match(js, /COMMENT_SHEET_DRAG_RANGE_PX/u);
  assert.match(js, /--comment-sheet-drag/u);
  assert.doesNotMatch(js, /#commentInput, .comment-submit-btn/u);
});


test("BGM pauses when the app leaves the foreground", async () => {
  const js = await readFile(path.resolve("index.js"), "utf8");

  assert.match(js, /function pauseBgmForAppExit/u);
  assert.ok(js.includes('document.addEventListener("visibilitychange"'));
  assert.ok(js.includes('window.addEventListener("pagehide", pauseBgmForAppExit)'));
  assert.ok(js.includes('window.addEventListener("blur", pauseBgmForAppExit)'));
  assert.ok(js.includes('setupBgmAppExitPause()'));
});

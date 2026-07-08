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

test("profile bio migration extends public profile fields and default-only migration locks theme", async () => {
  const addSource = await readFile(addMigrationPath, "utf8");
  const defaultOnlySource = await readFile(defaultOnlyMigrationPath, "utf8");

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
});

test("profile edit surface keeps bio controls and removes non-default theme picker", async () => {
  const html = await readFile(path.resolve("index.html"), "utf8");
  const js = await readFile(path.resolve("index.js"), "utf8");

  assert.match(html, /id="editBioInput"/u);
  assert.match(html, /maxlength="60"/u);
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

test("comment sheet exposes source-post preview and focused input state", async () => {
  const html = await readFile(path.resolve("index.html"), "utf8");
  const js = await readFile(path.resolve("index.js"), "utf8");

  assert.match(html, /id="commentPostPreview"/u);
  assert.match(html, /id="commentPostPreviewAuthor"/u);
  assert.match(html, /id="commentPostPreviewContent"/u);
  assert.match(html, /\.comment-sheet\.is-input-focused/u);
  assert.match(js, /function renderCommentPostPreview/u);
  assert.match(js, /function setupCommentInputFocusState/u);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const migrationPath = path.resolve(
  "supabase/migrations/20260708020000_add_profile_bio_theme.sql",
);

test("profile bio and theme migration extends only public profile fields", async () => {
  const source = await readFile(migrationPath, "utf8");

  assert.match(source, /alter table public\.profiles\s+add column if not exists bio text/u);
  assert.match(source, /alter table public\.profiles\s+add column if not exists theme text not null default 'default'/u);
  assert.match(source, /char_length\(coalesce\(bio, ''\)\) <= 60/u);
  assert.match(source, /theme in \('default', 'lofi_night', 'vintage_analog'\)/u);
  assert.match(
    source,
    /grant select \(id, nickname, custom_id, avatar_url, bio, theme, updated_at\)\s+on public\.profiles\s+to anon, authenticated;/u,
  );
  assert.match(
    source,
    /grant update \(nickname, custom_id, avatar_url, bio, theme, updated_at\)\s+on public\.profiles\s+to authenticated;/u,
  );
  assert.doesNotMatch(source, /drop policy|create policy|delete_user_data|service_role client/iu);
});

test("profile edit surface exposes bio and profile theme controls", async () => {
  const html = await readFile(path.resolve("index.html"), "utf8");
  const js = await readFile(path.resolve("index.js"), "utf8");

  assert.match(html, /id="editBioInput"/u);
  assert.match(html, /maxlength="60"/u);
  assert.match(html, /data-profile-theme-option="lofi_night"/u);
  assert.match(html, /data-profile-theme-option="vintage_analog"/u);
  assert.match(html, /id="profileBio"/u);
  assert.match(html, /id="viewedProfileBio"/u);

  assert.match(js, /const PROFILE_THEMES = Object\.freeze/u);
  assert.match(js, /function normalizeProfileBio/u);
  assert.match(js, /function setSelectedProfileTheme/u);
  assert.match(js, /\.select\("id, nickname, custom_id, avatar_url, bio, theme"\)/u);
  assert.match(js, /applyViewedProfileTheme\(profile\.theme\)/u);
  assert.doesNotMatch(js, /profileBio\.innerHTML|viewedProfileBio\.innerHTML/u);
});

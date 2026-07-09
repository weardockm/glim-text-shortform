import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../../index.js", import.meta.url), "utf8");

function extractFunction(name, nextDeclaration) {
  const functionStart = source.indexOf(`function ${name}`);
  const asyncFunctionStart = source.indexOf(`async function ${name}`);
  const starts = [functionStart, asyncFunctionStart].filter((index) => index >= 0);
  const start = Math.min(...starts);
  const end = source.indexOf(`
${nextDeclaration}`, start);
  assert.ok(Number.isFinite(start) && start >= 0 && end > start, `cannot extract ${name}`);
  return source.slice(start, end);
}

const profileHarnessSource = String.raw`
function createProfilePersistenceError(error) {
  const persistenceError = new Error("Profile persistence failed");
  persistenceError.name = "ProfilePersistenceError";
  persistenceError.cause = error || null;
  if (typeof error?.code === "string") persistenceError.code = error.code;
  return persistenceError;
}
function normalizeProfileBio(value) {
  return Array.from(String(value ?? "").trim()).slice(0, PROFILE_BIO_MAX_LENGTH).join("");
}
function isValidProfileTheme(value) {
  return Object.prototype.hasOwnProperty.call(PROFILE_THEMES, value);
}
function getSafeProfileTheme(value) {
  return isValidProfileTheme(value) ? value : "default";
}
function getCurrentEmailLocalPart() {
  return currentUser?.email?.split("@")[0] || "";
}
function getCurrentAuthorNickname() {
  return currentProfileNickname || currentUser?.user_metadata?.random_nickname || getCurrentEmailLocalPart() || "익명";
}
function getCurrentAuthorCustomId() {
  return currentProfileCustomId || currentUser?.user_metadata?.custom_id || getCurrentEmailLocalPart();
}
function normalizePersistedAvatarUrl(avatarUrl) {
  const value = typeof avatarUrl === "string" ? avatarUrl.trim() : "";
  if (!value) return DEFAULT_PROFILE_AVATAR_URL;
  if (value === DEFAULT_PROFILE_AVATAR_URL || value.includes("/image/glimmer-profile-image.png")) return DEFAULT_PROFILE_AVATAR_URL;
  return value.includes(PROFILE_AVATAR_STORAGE_PATH) ? value : DEFAULT_PROFILE_AVATAR_URL;
}
function resetCurrentProfileState() {
  currentProfileNickname = "";
  currentProfileCustomId = "";
  currentProfileBio = "";
  currentProfileTheme = "default";
  selectedProfileTheme = "default";
}
`;

function createProfileSyncContext({
  legacyUpdateError = null,
  legacyUpdateCount = 1,
  legacyInsertError = null,
  appearanceUpdateError = {
    code: "PGRST204",
    message: "Could not find the bio column of profiles in the schema cache",
  },
} = {}) {
  const writes = [];
  const diagnostics = [];
  const context = {
    currentUser: {
      id: "user-1",
      email: "old@example.test",
      user_metadata: {
        random_nickname: "새이름",
        custom_id: "new.id",
        avatar_url: "https://qdnpeliqtxdglqewbvgg.supabase.co/storage/v1/object/public/avatars/user-1/avatar.png",
      },
    },
    currentProfileNickname: "새이름",
    currentProfileCustomId: "new.id",
    currentProfileBio: "새 소개",
    currentProfileTheme: "default",
    DEFAULT_PROFILE_AVATAR_URL: "image/glimmer-profile-image.png",
    PROFILE_AVATAR_STORAGE_PATH: "/storage/v1/object/public/avatars/",
    PROFILE_BIO_MAX_LENGTH: 60,
    PROFILE_THEMES: Object.freeze({ default: { label: "기본", viewClass: "profile-theme-default" } }),
    selectedProfileTheme: "default",
    client: {
      from(table) {
        assert.equal(table, "profiles");
        return {
          update(values, options = {}) {
            return {
              eq(column, value) {
                const isAppearanceUpdate = "bio" in values || "theme" in values;
                writes.push({
                  method: "update",
                  values: { ...values },
                  options: { ...options },
                  column,
                  value,
                  isAppearanceUpdate,
                });
                if (isAppearanceUpdate) {
                  return Promise.resolve({ error: appearanceUpdateError });
                }
                return Promise.resolve({ count: legacyUpdateCount, error: legacyUpdateError });
              },
            };
          },
          insert(row) {
            writes.push({ method: "insert", row: { ...row } });
            return Promise.resolve({ error: legacyInsertError });
          },
          select() {
            throw new Error("preserveStoredAvatar=false should not read the stored profile");
          },
        };
      },
    },
    writes,
    diagnostics,
    reportClientDiagnostic(contextName, detail) {
      diagnostics.push({ contextName, detail });
    },
  };
  vm.createContext(context);
  vm.runInContext(profileHarnessSource, context);
  vm.runInContext(extractFunction("isMissingProfileAppearanceColumnError", "async function runVisibleContentQuery"), context);
  vm.runInContext(extractFunction("getCurrentProfileData", "async function refreshCurrentUserRole"), context);
  return context;
}

test("Profile sync persists legacy profile fields before optional appearance fields", async () => {
  const context = createProfileSyncContext();

  await vm.runInContext(
    "syncCurrentUserProfile({ preserveStoredAvatar: false, requirePersistence: true })",
    context,
  );

  assert.equal(context.writes.length, 2);
  assert.equal(context.writes[0].method, "update");
  assert.equal(context.writes[0].column, "id");
  assert.equal(context.writes[0].value, "user-1");
  assert.equal(context.writes[0].options.count, "exact");
  assert.equal(context.writes[0].values.nickname, "새이름");
  assert.equal(context.writes[0].values.custom_id, "new.id");
  assert.equal(context.writes[0].values.avatar_url.includes("/avatars/"), true);
  assert.equal("bio" in context.writes[0].values, false);
  assert.equal("theme" in context.writes[0].values, false);
  assert.equal(context.writes[1].isAppearanceUpdate, true);
  assert.equal(context.writes[1].values.bio, "새 소개");
  assert.deepEqual(context.diagnostics.map(({ contextName }) => contextName), [
    "profile-appearance-columns-missing",
  ]);
});

test("Profile sync inserts legacy profile row when no profile row was updated", async () => {
  const context = createProfileSyncContext({ legacyUpdateCount: 0, appearanceUpdateError: null });

  await vm.runInContext(
    "syncCurrentUserProfile({ preserveStoredAvatar: false, requirePersistence: true })",
    context,
  );

  assert.equal(context.writes[0].method, "update");
  assert.equal(context.writes[1].method, "insert");
  assert.equal(context.writes[1].row.id, "user-1");
  assert.equal(context.writes[1].row.nickname, "새이름");
  assert.equal(context.writes[1].row.custom_id, "new.id");
  assert.equal("bio" in context.writes[1].row, false);
  assert.equal("theme" in context.writes[1].row, false);
  assert.equal(context.writes[2].isAppearanceUpdate, true);
});

test("Profile sync rejects when required legacy profile storage fails", async () => {
  const context = createProfileSyncContext({
    legacyUpdateError: { code: "42501", message: "permission denied for table profiles" },
  });

  await assert.rejects(
    vm.runInContext(
      "syncCurrentUserProfile({ preserveStoredAvatar: false, requirePersistence: true })",
      context,
    ),
    { name: "ProfilePersistenceError" },
  );
  assert.equal(context.writes.length, 1);
  assert.equal(context.writes[0].isAppearanceUpdate, false);
  assert.deepEqual(context.diagnostics.map(({ contextName }) => contextName), ["profile-sync"]);
});

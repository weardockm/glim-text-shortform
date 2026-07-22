import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const supabaseDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryDir = dirname(supabaseDir);
const migrationsDir = join(supabaseDir, "migrations");

const originalMigrationHashes = Object.freeze({
  "20260702020000_push_notifications.sql":
    "8adba920bee5cc5a4ca0c9230930ab8a5cdf381eb55c50706eb00da3d3c989b9",
  "20260703010000_notification_preview.sql":
    "8f85aa9338ffa779facaac0785f40a985c6285b862846a38f1a1c6bace66df7c",
  "20260703020000_notifications_rls.sql":
    "0eb532cf56576d806d8f357e6d07a9b61d988e084b48731ff43de6964be215a7",
  "20260703021000_fix_delete_user_data.sql":
    "7e9f24b8b9fe6a07022d9f05e4be8e73bbdb7c4131a63fb3c2d85220dd0911cf",
  "20260703030000_moderation_reports.sql":
    "441710ab3798bad9d1dc95fe089bfdc2ebf9e7e9877ddafc009f9c24970d6e48",
  "20260703031000_protect_moderation_status.sql":
    "4e2a91badecf9d811dc70943bc6b9350730ebf97475942c63712f2c16f207247",
  "20260703040000_secure_content_rls.sql":
    "35807d9bd402e8b7d78f1087a9c73c8fe93b6545c0bd9c19690308dec3e3f34a",
  "20260703041000_harden_profile_sync.sql":
    "0e4f3c37a77752121726e9134b92d2737273a1190967f069f6fd2537b92bf6c6",
});

const failures = [];

function requireFile(relativePath) {
  const absolutePath = join(supabaseDir, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`missing ${relativePath}`);
    return "";
  }
  return readFileSync(absolutePath, "utf8");
}

function requirePattern(source, pattern, label) {
  if (!pattern.test(source)) failures.push(`missing contract: ${label}`);
}

function forbidPattern(source, pattern, label) {
  if (pattern.test(source)) failures.push(`forbidden contract: ${label}`);
}

function extractPolicyClause(source, policyName, clauseName) {
  const policyStart = source.toLowerCase().indexOf(
    `create policy "${policyName.toLowerCase()}"`,
  );
  if (policyStart < 0) return null;

  const nextPolicy = source.toLowerCase().indexOf("\ndrop policy", policyStart);
  const policyBlock = source.slice(
    policyStart,
    nextPolicy < 0 ? source.length : nextPolicy,
  );
  const clausePattern =
    clauseName === "with check" ? /\bwith\s+check\s*\(/i : /\busing\s*\(/i;
  const clauseMatch = clausePattern.exec(policyBlock);
  if (!clauseMatch) return null;

  const openOffset =
    clauseMatch.index + clauseMatch[0].lastIndexOf("(");
  let depth = 1;
  let quoted = false;
  for (let index = openOffset + 1; index < policyBlock.length; index += 1) {
    const character = policyBlock[index];
    if (character === "'") {
      if (quoted && policyBlock[index + 1] === "'") {
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth === 0) return policyBlock.slice(openOffset + 1, index);
  }
  return null;
}

function normalizeSqlExpression(expression) {
  let normalized = "";
  let quoted = false;
  for (let index = 0; index < expression.length; index += 1) {
    const character = expression[index];
    if (character === "'") {
      normalized += character;
      if (quoted && expression[index + 1] === "'") {
        normalized += expression[index + 1];
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (quoted || !/\s/.test(character)) normalized += character.toLowerCase();
  }
  return normalized;
}

function requireExactPolicyClause(
  source,
  policyName,
  clauseName,
  expectedExpression,
) {
  const expression = extractPolicyClause(source, policyName, clauseName);
  if (
    expression === null ||
    normalizeSqlExpression(expression) !==
      normalizeSqlExpression(expectedExpression)
  ) {
    failures.push(
      `invalid policy predicate: ${policyName} ${clauseName}`,
    );
  }
}

for (const [name, expectedHash] of Object.entries(originalMigrationHashes)) {
  const contents = requireFile(join("migrations", name));
  if (!contents) continue;
  const actualHash = createHash("sha256").update(contents).digest("hex");
  if (actualHash !== expectedHash) failures.push(`applied migration changed: ${name}`);
}

const baseline = requireFile("migrations/20260701000000_baseline_schema.sql");
for (const table of [
  "profiles",
  "posts",
  "comments",
  "follows",
  "blocks",
  "notifications",
]) {
  requirePattern(
    baseline,
    new RegExp(`create table if not exists public\\.${table}\\b`, "i"),
    `baseline table public.${table}`,
  );
}
requirePattern(
  baseline,
  /create(?: or replace)? function public\.handle_new_user_profile\(\)/i,
  "handle_new_user_profile reset dependency",
);
requirePattern(
  baseline,
  /create(?: or replace)? function public\.remove_follows_after_block\(\)/i,
  "remove_follows_after_block reset dependency",
);
forbidPattern(
  baseline,
  /create or replace function public\.(?:handle_new_user_profile|remove_follows_after_block)/i,
  "adopted baseline cannot replace linked trigger functions",
);
forbidPattern(
  baseline,
  /drop trigger if exists (?:on_auth_user_created|remove_follows_after_block_trigger)/i,
  "adopted baseline cannot replace linked triggers",
);
forbidPattern(
  baseline,
  /create policy/i,
  "baseline cannot add policies after linked hardening",
);
forbidPattern(
  baseline,
  /to anon|to authenticated/i,
  "baseline cannot grant client access after linked hardening",
);
forbidPattern(
  baseline,
  /revoke all privileges|grant all privileges/i,
  "baseline cannot change linked table privileges",
);

const coreAccess = requireFile(
  "migrations/20260704000500_core_access_rls.sql",
);
for (const table of ["profiles", "follows", "blocks"]) {
  requirePattern(
    coreAccess,
    new RegExp(`tablename in \\([^)]*'${table}'`, "is"),
    `core access clears ${table} policies`,
  );
}
requirePattern(
  coreAccess,
  /grant select \(id, nickname, custom_id, avatar_url, updated_at\)/i,
  "profile public columns are explicit",
);

const commentReportsCountMigration = requireFile(
  "migrations/20260706000000_add_comment_reports_count.sql",
);
requirePattern(
  commentReportsCountMigration,
  /alter\s+table\s+public\.comments\s+add\s+column\s+if\s+not\s+exists\s+reports_count\s+integer\s+not\s+null\s+default\s+0\s*;/i,
  "comments.reports_count exists for comment reports",
);
forbidPattern(
  commentReportsCountMigration,
  /\bgrant\b|\brevoke\b|\bpolicy\b/i,
  "comments.reports_count migration must not broaden access",
);

const avatarMigrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith("_avatar_storage.sql"),
);
const avatarMigration = avatarMigrationName
  ? requireFile(join("migrations", avatarMigrationName))
  : "";
if (!avatarMigrationName) failures.push("missing append-only avatar storage migration");
requirePattern(avatarMigration, /insert into storage\.buckets/i, "avatars bucket");
const avatarOwnerPredicate =
  "bucket_id = 'avatars' and " +
  "(storage.foldername(name))[1] = (select auth.uid())::text";
requireExactPolicyClause(
  avatarMigration,
  "Anyone can read avatars",
  "using",
  "bucket_id = 'avatars'",
);
requireExactPolicyClause(
  avatarMigration,
  "Avatar owners can upload",
  "with check",
  avatarOwnerPredicate,
);
requireExactPolicyClause(
  avatarMigration,
  "Avatar owners can update",
  "using",
  avatarOwnerPredicate,
);
requireExactPolicyClause(
  avatarMigration,
  "Avatar owners can update",
  "with check",
  avatarOwnerPredicate,
);
requireExactPolicyClause(
  avatarMigration,
  "Avatar owners can delete",
  "using",
  avatarOwnerPredicate,
);
const broadenedAvatarDeletePolicy = `
create policy "Avatar owners can delete"
  on storage.objects
  for delete
  to authenticated
  using (${avatarOwnerPredicate} or true);
`;
const broadenedAvatarPredicate = extractPolicyClause(
  broadenedAvatarDeletePolicy,
  "Avatar owners can delete",
  "using",
);
if (
  broadenedAvatarPredicate === null ||
  normalizeSqlExpression(broadenedAvatarPredicate) ===
    normalizeSqlExpression(avatarOwnerPredicate)
) {
  failures.push("avatar predicate parser accepts OR true broadening");
}

const bgmMigration = requireFile(
  "migrations/20260704000200_bgm_storage.sql",
);
requirePattern(bgmMigration, /'bgm'/i, "bgm bucket");
requirePattern(bgmMigration, /'audio\/mpeg'/i, "bgm MIME restriction");
requireExactPolicyClause(
  bgmMigration,
  "Anyone can read bgm",
  "using",
  "bucket_id = 'bgm'",
);
forbidPattern(
  bgmMigration,
  /for\s+(?:insert|update|delete)|for\s+all/i,
  "bgm bucket cannot expose client writes",
);

const bgmCatalogMigration = requireFile(
  "migrations/20260723010000_bgm_catalog.sql",
);
requirePattern(
  bgmCatalogMigration,
  /create table if not exists public\.bgm_tracks/i,
  "dynamic BGM catalog table",
);
requirePattern(
  bgmCatalogMigration,
  /create policy "Active BGM tracks are publicly readable"[\s\S]*?for select[\s\S]*?to anon, authenticated/i,
  "active BGM catalog is publicly readable",
);
for (const operation of ["insert", "update", "delete"]) {
  requirePattern(
    bgmCatalogMigration,
    new RegExp(
      `create policy "Moderators can ${operation} BGM tracks"[\\s\\S]*?` +
        `${operation === "insert" ? "with check" : "using"}\\s*\\(\\(select public\\.is_moderator\\(\\)\\)\\)`,
      "i",
    ),
    `only moderators can ${operation} BGM catalog rows`,
  );
}
for (const operation of ["upload", "update", "delete"]) {
  requirePattern(
    bgmCatalogMigration,
    new RegExp(
      `create policy "Moderators can ${operation} bgm"[\\s\\S]*?` +
        `bucket_id = 'bgm'[\\s\\S]*?public\\.is_moderator\\(\\)`,
      "i",
    ),
    `only moderators can ${operation} BGM objects`,
  );
}
for (const storagePath of [
  "Paper Cup Piano.mp3",
  "Paper Boat After Rain.mp3",
]) {
  requirePattern(
    bgmCatalogMigration,
    new RegExp(storagePath.replaceAll(".", "\\."), "i"),
    `BGM catalog seeds ${storagePath}`,
  );
}

const bgmPublicReadFix = requireFile(
  "migrations/20260723012000_fix_bgm_catalog_public_read.sql",
);
requireExactPolicyClause(
  bgmPublicReadFix,
  "Active BGM tracks are publicly readable",
  "using",
  "is_active",
);
requirePattern(
  bgmPublicReadFix,
  /create or replace function public\.list_bgm_tracks_for_moderation\(\)/i,
  "moderator-only BGM catalog listing RPC",
);
requirePattern(
  bgmPublicReadFix,
  /revoke all[\s\S]*?list_bgm_tracks_for_moderation\(\)[\s\S]*?from public, anon/i,
  "BGM moderator listing is unavailable to anon",
);
requirePattern(
  bgmPublicReadFix,
  /grant execute[\s\S]*?list_bgm_tracks_for_moderation\(\)[\s\S]*?to authenticated, service_role/i,
  "BGM moderator listing is authenticated-only",
);

const bgmCategoriesMigration = requireFile(
  "migrations/20260723013000_bgm_categories.sql",
);
requirePattern(
  bgmCategoriesMigration,
  /add column if not exists category text not null default '잔잔한'/i,
  "BGM catalog categories default existing tracks safely",
);
for (const category of ["잔잔한", "감성", "신나는", "몽환적인", "집중"]) {
  requirePattern(
    bgmCategoriesMigration,
    new RegExp(`category in \\([^)]*'${category}'`, "i"),
    `BGM category constraint allows ${category}`,
  );
}
requirePattern(
  bgmCategoriesMigration,
  /returns table \([\s\S]*?category text[\s\S]*?track\.category/i,
  "moderator BGM listing returns each track category",
);
requirePattern(
  bgmCategoriesMigration,
  /revoke all[\s\S]*?list_bgm_tracks_for_moderation\(\)[\s\S]*?from public, anon/i,
  "categorized BGM moderator listing remains unavailable to anon",
);

requireFile("seed.sql");
const baselineGuide = requireFile("BASELINE.md");
requirePattern(
  baselineGuide,
  /migration repair/i,
  "baseline history reconciliation path",
);
requirePattern(
  baselineGuide,
  /--include-all/i,
  "explicit baseline application path",
);
requirePattern(
  baselineGuide,
  /explicit approval/i,
  "baseline remote approval gate",
);
const inventory = requireFile("schema-inventory.sql");
requirePattern(inventory, /pg_policies/i, "schema inventory includes RLS policies");
requirePattern(inventory, /storage\.buckets/i, "schema inventory includes storage buckets");
for (const objectName of [
  "profiles",
  "posts",
  "comments",
  "follows",
  "blocks",
  "notifications",
  "post_likes",
  "comment_likes",
  "bookmarks",
  "push_subscriptions",
  "reports",
  "account_deletion_requests",
  "avatars",
  "bgm",
  "is_moderator",
  "sync_authored_display_name",
  "toggle_post_like",
  "toggle_comment_like",
  "toggle_post_bookmark",
  "import_legacy_post_like",
  "import_legacy_comment_like",
  "import_legacy_bookmark",
  "submit_content_report",
  "moderate_report",
  "create_operator_notice",
  "delete_operator_notice",
  "delete-account",
  "send-push",
  "Paper Cup Piano.mp3",
  "Paper Boat After Rain.mp3",
]) {
  requirePattern(
    inventory,
    new RegExp(`['"]${objectName}['"]`, "i"),
    `inventory tracks ${objectName}`,
  );
}

const avatarRlsTest = requireFile("tests/avatar_storage_rls.sql");
requirePattern(
  avatarRlsTest,
  /set local role anon[\s\S]*public avatar can be read/i,
  "avatar test reads as anon",
);
requirePattern(
  avatarRlsTest,
  /throws_ok\([\s\S]*delete from storage\.objects[\s\S]*Direct deletion from storage tables is not allowed[\s\S]*direct storage table delete is blocked for another user; Storage API handles deletion/i,
  "avatar test proves cross-user direct table delete is blocked",
);
requirePattern(
  avatarRlsTest,
  /throws_ok\([\s\S]*delete from storage\.objects[\s\S]*Direct deletion from storage tables is not allowed[\s\S]*owner direct storage table delete is blocked; Storage API handles deletion/i,
  "avatar test proves owner direct table delete is blocked",
);
const deleteAccount = requireFile("functions/delete-account/index.ts");
const accountDeletionRequests = requireFile(
  "migrations/20260706020000_account_deletion_requests.sql",
);
const indexHtml = readFileSync(join(repositoryDir, "index.html"), "utf8");
const indexSource = readFileSync(join(repositoryDir, "index.js"), "utf8");
requirePattern(
  deleteAccount,
  /export\s+async\s+function\s+handleDeleteAccountRequest/,
  "delete-account exports a testable request handler",
);
requirePattern(
  deleteAccount,
  /delete_user_data/,
  "delete-account invokes the server-owned deletion RPC",
);
requirePattern(
  deleteAccount,
  /auth\.admin\.deleteUser/,
  "delete-account deletes the Supabase Auth identity with service role only",
);
requirePattern(
  deleteAccount,
  /revokeAppleCredential/,
  "delete-account contains an Apple credential revocation seam",
);
requirePattern(
  accountDeletionRequests,
  /create\s+table\s+if\s+not\s+exists\s+public\.account_deletion_requests/i,
  "account deletion request table exists",
);
requirePattern(
  accountDeletionRequests,
  /create\s+or\s+replace\s+function\s+public\.request_account_deletion/i,
  "public deletion request RPC exists",
);
requirePattern(
  accountDeletionRequests,
  /on\s+conflict\s+do\s+nothing/i,
  "public deletion requests are duplicate safe",
);
requirePattern(
  accountDeletionRequests,
  /delete\s+from\s+public\.push_subscriptions/i,
  "delete_user_data removes push subscriptions",
);
requirePattern(
  indexHtml,
  /id="view-account-delete"/,
  "public account deletion view exists",
);
requirePattern(
  indexSource,
  /function\s+openAccountDeleteView/,
  "client can route to the public account deletion view",
);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("repository contracts: PASS");
}

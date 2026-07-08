import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const indexHtml = read("index.html");
const indexSource = read("index.js");
const adminHtml = read("admin.html");
const adminSource = read("admin.js");
const workerSource = read("firebase-messaging-sw.js");
const renderBlueprint = read("render.yaml");

test("Render delivery declares the complete launch security header contract", () => {
  for (const header of [
    "Content-Security-Policy",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Referrer-Policy",
    "Permissions-Policy",
  ]) {
    assert.match(renderBlueprint, new RegExp(`name:\\s+${header}`));
  }
  const csp = renderBlueprint.match(
    /name:\s+Content-Security-Policy\s+value:\s+([^\r\n]+)/,
  )?.[1];
  assert.ok(csp, "CSP header is missing");
  for (const directive of [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ]) {
    assert.ok(csp.includes(directive), `CSP missing ${directive}`);
  }
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-(?:inline|eval)'/);
});

test("Executable inline script and event-handler attributes are eliminated", () => {
  assert.doesNotMatch(indexHtml, /<script(?![^>]*\bsrc=)[^>]*>/i);
  for (const [file, source] of [
    ["index.html", indexHtml],
    ["admin.html", adminHtml],
    ["index.js", indexSource],
    ["admin.js", adminSource],
  ]) {
    assert.doesNotMatch(
      source,
      /<[^>]*\son[a-z]+\s*=/i,
      `${file} still contains an executable inline event handler`,
    );
  }
  assert.match(indexSource, /function setupDeclarativeEventHandlers\(\)/);
  assert.match(adminSource, /function setupAdminEventHandlers\(\)/);
  assert.doesNotMatch(`${indexSource}\n${adminSource}`, /\beval\s*\(|new Function\s*\(/);
});

test("Browser dependencies are exact-versioned and Supabase carries SRI", () => {
  for (const [file, source] of [
    ["index.html", indexHtml],
    ["admin.html", adminHtml],
  ]) {
    assert.match(
      source,
      /@supabase\/supabase-js@2\.110\.0/,
      `${file} must pin Supabase JS`,
    );
    assert.doesNotMatch(source, /@supabase\/supabase-js@2(?:["/])/);
    assert.match(source, /integrity="sha384-[A-Za-z0-9+/=]+"/);
    assert.match(source, /crossorigin="anonymous"/);
  }
  assert.match(workerSource, /firebasejs\/12\.15\.0\/firebase-app-compat\.js/);
  assert.match(workerSource, /firebasejs\/12\.15\.0\/firebase-messaging-compat\.js/);
});

test("Material Symbols are self-hosted with pinned integrity and no ligature fallback dependency", () => {
  const stylesheetPath = new URL(
    "../../assets/fonts/glim-fonts.css",
    import.meta.url,
  );
  const fontPath = new URL(
    "../../assets/fonts/material-symbols-outlined-v355.woff2",
    import.meta.url,
  );
  assert.ok(existsSync(stylesheetPath), "local font stylesheet is missing");
  assert.ok(existsSync(fontPath), "pinned Material Symbols font is missing");

  const stylesheet = readFileSync(stylesheetPath);
  const integrity = `sha384-${createHash("sha384").update(stylesheet).digest("base64")}`;
  for (const [file, source] of [["index.html", indexHtml]]) {
    assert.doesNotMatch(
      source,
      /fonts\.googleapis\.com\/css2\?family=Material\+Symbols/,
      `${file} must not depend on remote Material Symbols CSS`,
    );
    assert.match(
      source,
      /href="assets\/fonts\/glim-fonts\.css\?v=1"/,
      `${file} must load the pinned local font stylesheet`,
    );
    assert.match(
      source,
      new RegExp(`integrity="${integrity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
      `${file} local font stylesheet integrity must match its bytes`,
    );
  }

  assert.match(
    stylesheet.toString("utf8"),
    /material-symbols-outlined-v355\.woff2/,
  );
  assert.match(stylesheet.toString("utf8"), /font-feature-settings:\s*"liga"/);
});

test("Empty state contrast and narrow Korean phrase boundaries use design tokens", () => {
  assert.match(indexHtml, /--glim-text-empty:\s*#888/);
  assert.match(
    indexHtml,
    /html\[data-theme="light"\]\s*\{[^}]*--glim-text-empty:\s*#555/s,
  );
  assert.match(
    indexHtml,
    /\.feed-state\.is-empty\s+\.feed-state-title\s*\{[^}]*color:\s*var\(--glim-text-empty\)/s,
  );
  assert.match(indexSource, /kind:\s*"empty"/);
  assert.match(indexHtml, /\.cjk-keep\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(
    indexHtml,
    /항목 및\s+<span class="cjk-keep">수집 방법<\/span>\)/,
  );
  assert.match(
    indexHtml,
    /회원이\s+<span class="cjk-keep">이용할 수 있는<\/span>/,
  );
  assert.match(
    indexHtml,
    /\.post-textarea\s*\{[^}]*word-break:\s*keep-all/s,
  );
});

test("Notification navigation and client media URLs are allowlisted", () => {
  assert.match(workerSource, /function getSafeNotificationUrl\(/);
  assert.match(workerSource, /candidate\.origin !== self\.location\.origin/);
  assert.match(workerSource, /getSafeNotificationUrl\(event\.notification/);
  assert.match(indexSource, /function getTrustedMediaUrl\(/);
  assert.match(indexSource, /SUPABASE_STORAGE_ORIGIN/);
  assert.match(indexSource, /bgmPlayer\.src = trustedBgmUrl/);
  assert.doesNotMatch(indexSource, /bgmPlayer\.src = bgmUrl/);

  const notificationUrlFunction = workerSource.match(
    /function getSafeNotificationUrl\(value\) \{[\s\S]*?\n\}/,
  )?.[0];
  assert.ok(notificationUrlFunction);
  const workerContext = {
    URL,
    self: { location: { origin: "https://glimfactory.com" } },
  };
  vm.runInNewContext(notificationUrlFunction, workerContext);
  assert.equal(
    workerContext.getSafeNotificationUrl("https://evil.example/phish"),
    "https://glimfactory.com",
  );
  assert.equal(
    workerContext.getSafeNotificationUrl("javascript:alert(1)"),
    "https://glimfactory.com",
  );
  assert.equal(
    workerContext.getSafeNotificationUrl("/?notificationPost=safe"),
    "https://glimfactory.com/?notificationPost=safe",
  );
});

test("Production diagnostics redact error objects and auth material", () => {
  assert.match(indexSource, /function reportClientDiagnostic\(/);
  assert.match(adminSource, /function reportAdminDiagnostic\(/);
  assert.doesNotMatch(
    `${indexSource}\n${adminSource}`,
    /console\.(?:warn|error)\([^;\n]*(?:access_token|refresh_token|session|,\s*error\b)/i,
  );
});

test("Offline startup and data failures have an explicit recovery state", () => {
  assert.match(indexHtml, /id="connectivityStatus"/);
  assert.match(indexSource, /function setupConnectivityStatus\(\)/);
  assert.match(indexSource, /navigator\.onLine/);
  assert.match(indexSource, /window\.addEventListener\("offline"/);
  assert.match(indexSource, /window\.addEventListener\("online"/);
  assert.match(indexSource, /연결이 끊겼습니다/);
  assert.match(indexSource, /다시 시도/);
});

test("Static asset cache versions advance together after hardening", () => {
  assert.match(indexHtml, /theme-bootstrap\.js\?v=1/);
  assert.match(indexHtml, /push-config\.js\?v=3/);
  assert.match(indexHtml, /index\.js\?v=95/);
  assert.match(adminHtml, /admin\.js\?v=9/);
  assert.match(workerSource, /push-config\.js\?v=3/);
});

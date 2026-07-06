# glim-production-roadmap - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** A security-audited Glim release that keeps the current web app, adds native iOS and Android packages, and is submitted to the Korean App Store and Google Play through staged test tracks.

**Why this approach:** The product loop already exists. The shortest credible route to stores is to close the missing backend and UGC-safety contracts first, then package allowlisted local assets with native authentication, push, deep links, and app-quality integrations.

**What it will NOT do:** It will not rewrite the frontend framework, add monetization/chat/AI, embed the moderator console in the mobile app, or load a remote website as the production native runtime.

**Effort:** XL
**Risk:** High - security, native signing, OAuth, push delivery, UGC policy, and two independent store reviews must all pass.
**Decisions to sanity-check:** Capacitor 8 for both stores, local bundled web assets, `com.glimfactory.glim`, `https://glimfactory.com`, Korea-only 1.0, free/no ads/no purchases, web moderation console only, TDD for security contracts, and characterization-first client changes.

Your next move: run this plan with `$omo:start-work`, or request the optional dual high-accuracy review first. Full execution detail follows below.

---

> TL;DR (machine): XL/high-risk security and dual-store release; 16 dependency-ordered todos; web remains buildless while native packages use Capacitor 8 and local assets.

## Scope
### Must have
- Reproducible Supabase schema/storage/Edge contracts, including avatar storage and account deletion.
- Least-privilege RLS/grants/RPCs, UUID role authorization, abuse throttles, safe notification delivery, and auditable moderation.
- Versioned UGC terms consent, pre-publication objectionable-content filtering, report/block flows, support contact, and moderation response workflow.
- Characterization tests around classic globals/inline handlers before client security refactors.
- Render-managed production origin `https://glimfactory.com`, canonical `www` redirect, security headers, and public policy/support/deletion routes.
- Capacitor 8 native projects with application ID `com.glimfactory.glim`, allowlisted local assets, no production `server.url`, and no admin assets.
- Native OAuth/deep links, Firebase push, OS sharing, haptics, network/offline state, safe areas, launch assets, and permission fallbacks.
- App Store/Play privacy declarations, age/content ratings, Korean metadata, reviewer instructions, screenshots, signed artifacts, test-track evidence, staged rollout, monitoring, and rollback.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not edit applied timestamp migrations; add later migrations.
- Do not expose service-role, Firebase service account, signing keys, `.p8`, keystores, provisioning profiles, or store API credentials.
- Do not trust client email/nickname/counters/role flags for authorization.
- Do not package `admin.html`, `admin.js`, `supabase/`, `.omo/`, Git metadata, source maps containing secrets, or development-only files into native binaries.
- Do not use a remote Render URL as Capacitor's production `server.url` or introduce OTA code that bypasses store review.
- Do not claim policy compliance from unit tests alone; physical devices and store-distributed builds are required.
- Do not add monetization, subscriptions, ads, chat, direct messages, generative AI, a framework rewrite, or a visual rebrand.

## Verification strategy
> Automated verification is agent-executed. Store account enrollment, signing consent, reviewer submission, and physical-device interaction require the account owner/device holder, but every expected input and binary PASS condition is specified.
- Test decision: Node built-in test runner for pure/static contracts; Playwright for browser journeys/accessibility; Supabase CLI plus SQL adversarial fixtures for RLS/RPC; XCTest/Gradle connected tests for native seams; physical iPhone/Android evidence for push/OAuth/deep links.
- RED→GREEN: every behavior/security change begins with a failing contract, adversarial SQL, browser scenario, or native test captured before production edits.
- Evidence root: `.omo/evidence/glim-production-roadmap/`; each todo writes command logs, JSON/SQL results, screenshots, and cleanup receipts under `task-<N>/`.
- Release gates: G0 baseline reproducible; G1 security/UGC approved; G2 web regression approved; G3 native device matrix approved; G4 store metadata/privacy approved; G5 TestFlight/Play track approved; G6 staged production healthy.

## Execution strategy
### Parallel execution waves
- Wave 0, baseline: todos 1-3.
- Wave 1, security and policy: todos 4-7 after Wave 0 contracts exist.
- Wave 2, native platform: todos 8-11 after G1.
- Wave 3, release evidence: todos 12-15 after native projects exist; todo 13 may begin after todo 7.
- Wave 4, launch: todo 16 after all prior gates.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | None | 4-16 | 2, 3 |
| 2 | None | 4-6, 10 | 1, 3 |
| 3 | None | 4-7, 13 | 1, 2 |
| 4 | 1, 2, 3 | 8-10, 14-16 | 5, 6, 7 |
| 5 | 1, 2, 3 | 9, 12, 14-16 | 4, 6, 7 |
| 6 | 1, 2, 3 | 12-16 | 4, 5, 7 |
| 7 | 1, 3 | 8, 13-16 | 4, 5, 6 |
| 8 | 4, 7 | 9-12, 14-16 | None |
| 9 | 5, 8 | 12, 14-16 | 10, 11 |
| 10 | 2, 4, 8 | 12, 14-16 | 9, 11 |
| 11 | 8 | 13-16 | 9, 10 |
| 12 | 5, 6, 8, 9, 10, 11 | 14-16 | 13 |
| 13 | 3, 7, 11 | 14-16 | 12 |
| 14 | 4-13 | 16 | 15 |
| 15 | 4-13 | 16 | 14 |
| 16 | 12-15 | Final verification | None |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. Establish the development, test, CI, and release-evidence foundation
  What to do / Must NOT do: Add `package.json`/lockfile, Node check/test scripts, Playwright, ast-grep rules, secret scanning, dependency audit/SBOM, a deterministic static server, CI, `.gitignore` coverage for native/signing artifacts, and evidence helpers. Add `render.yaml` only after importing the current dashboard behavior: static site, canonical domains, SPA rules only where needed, and baseline security headers. Preserve production as static/buildless; do not introduce a frontend framework or runtime bundler.
  Parallelization: Wave 0 | Blocked by: none | Blocks: 4-16
  References: `AGENTS.md:77-103`, `.gitignore`, `index.html:61-63`, `supabase/AGENTS.md:57-70`, Render service `glim-text-shortform`, `https://glimfactory.com`
  Acceptance criteria: `npm ci && npm run check && npm test && npm run test:e2e:smoke && npm run security:static && npm run sbom`; CI runs the same commands on a clean checkout; repository secret scan finds no private credential; Render blueprint diff preserves the live domain behavior.
  QA scenarios: Happy, run `npm run evidence -- task-1 npm run check` and confirm exit 0 plus four syntax-check receipts. Failure, place a fixture private key and unsafe DOM sink under `test/fixtures/negative/`, run the scanners with fixture mode, and confirm nonzero exit and exact rule IDs. Evidence: `.omo/evidence/glim-production-roadmap/task-1/`.
  Commit: Y | `chore(quality): establish release verification foundation`

- [x] 2. Make the Supabase backend reproducible from the repository
  What to do / Must NOT do: Capture the missing base schema as a new baseline path appropriate to the linked project, add later migrations for the `avatars` bucket/object policies, resolve enabled-but-missing seed configuration, define all required tables/indexes/FKs/policies/functions, and add the missing `delete-account` function directory skeleton without implementing deletion logic yet. Never edit the existing timestamp migrations and never copy remote secrets or `.temp` state.
  Parallelization: Wave 0 | Blocked by: none | Blocks: 4-6, 10
  References: `supabase/config.toml:63-72`, `supabase/migrations/`, `supabase/AGENTS.md`, `index.js:1574-1600`, `index.js:2182-2209`, `index.js:3704-3729`
  Acceptance criteria: a clean local Supabase start/reset succeeds twice; `npx supabase db lint --local --level warning` has no schema errors; a schema inventory asserts every client-referenced table/RPC/bucket/function exists; `npx supabase db push --linked --dry-run --yes` shows append-only changes.
  QA scenarios: Happy, run the clean reset and inventory script, then upload/read/delete an avatar as its owner. Failure, attempt cross-user avatar overwrite and call an absent/unauthorized RPC; both must be denied. Evidence: `.omo/evidence/glim-production-roadmap/task-2/`.
  Commit: Y | `chore(supabase): make backend contracts reproducible`

- [x] 3. Lock current behavior and write the security threat model
  What to do / Must NOT do: Characterize startup, anonymous reading, OAuth entry, feed/write/comment/like/bookmark/follow/block/report/profile/notification/admin flows before changing them. Inventory all 44 HTML sinks, local/session storage, public configuration, network endpoints, privilege boundaries, UGC abuse cases, and MASVS control groups. Classify findings by exploitability and store-blocking impact; do not label public Supabase/Firebase configuration as secret.
  Parallelization: Wave 0 | Blocked by: none | Blocks: 4-7, 13
  References: `index.js:1-160`, `index.js:1162-1293`, `index.js:2656-2666`, `index.js:2805-3292`, `index.js:3807-4237`, `index.js:5022-5609`, `admin.js:19-217`, `push-config.js`, `firebase-messaging-sw.js`
  Acceptance criteria: characterization suite is green against unmodified behavior; threat model maps assets, actors, trust boundaries, abuse cases, MASVS groups, controls, owners, and evidence; ast-grep sink inventory count is reviewed and every sink has safe/unsafe/constant classification.
  QA scenarios: Happy, execute Playwright anonymous/authenticated baseline journeys against localhost and save traces. Failure, inject HTML/script payloads into test posts/comments/profiles/notifications and confirm no script execution or DOM mutation outside text nodes. Evidence: `.omo/evidence/glim-production-roadmap/task-3/`.
  Commit: Y | `test(security): characterize web behavior and threats`

- [x] 4. Enforce least privilege, role consistency, and abuse resistance
  What to do / Must NOT do: Add follow-up migrations/RPCs so Auth UUID owns every mutation, `user_roles`/`is_moderator()` authorizes every privileged operation, broad grants are revoked, report/counter/moderation fields are server-owned, suspended/banned users cannot write, and blocks/notifications cannot be forged. Replace email authorization in the main UI and `send-push`; add server-side rate limits/dedupe for posting, comments, reactions, reports, follows, and push triggers. Restrict CORS to `https://glimfactory.com`, approved local origins, and native non-browser calls without treating CORS as authorization.
  Parallelization: Wave 1 | Blocked by: 1, 2, 3 | Blocks: 8-10, 14-16
  References: `index.js:4`, `index.js:2516-2522`, `supabase/migrations/20260703020000_notifications_rls.sql`, `20260703030000_moderation_reports.sql`, `20260703031000_protect_moderation_status.sql`, `20260703040000_secure_content_rls.sql`, `supabase/functions/send-push/index.ts:193-365`, `supabase/RLS_AUDIT.sql`
  Acceptance criteria: adversarial SQL/HTTP matrix proves anon read-only, owner-only writes, non-moderator denial, moderator success, suspended/banned denial, immutable counters/status, notification-event validation, and 429/deduped abuse behavior; RLS audit matches an approved snapshot.
  QA scenarios: Happy, authenticated users complete normal engagement and a role-backed moderator resolves a report. Failure, forged UUID/email/role/counter requests and cross-user mutations return 401/403/zero rows with no state change. Evidence: `.omo/evidence/glim-production-roadmap/task-4/`.
  Commit: Y | `fix(security): enforce server-owned authorization`

- [x] 5. Complete secure account lifecycle and deletion
  What to do / Must NOT do: Implement `supabase/functions/delete-account/index.ts` with authenticated recent-session verification, idempotent cleanup via the latest `delete_user_data`, avatar/push deletion, Auth user deletion, audit-safe result, and provider token revocation where required, including Sign in with Apple. Add a public `https://glimfactory.com/account-delete` flow that authenticates or submits a deletion request without exposing account existence. Keep the in-app destructive confirmation but do not require email/support contact as the only deletion route.
  Parallelization: Wave 1 | Blocked by: 1, 2, 3 | Blocks: 9, 12, 14-16
  References: `index.js:3668-3729`, `supabase/migrations/20260703021000_fix_delete_user_data.sql`, `20260703030000_moderation_reports.sql:440`, `20260703040000_secure_content_rls.sql:976`, Apple account-deletion and Google Play account-deletion requirements
  Acceptance criteria: deletion removes Auth identity, profile, authored UGC where legally allowed, engagement, blocks/follows/notifications/reports linkage, push endpoints, and avatar objects; retry returns a safe idempotent result; deletion page is public and store-linkable; Apple credential revocation receipt exists for Apple accounts.
  QA scenarios: Happy, create a fixture user with every dependent row/object, delete in app, and assert zero residual user-owned records/objects and failed re-login. Failure, invoke without JWT, with another UUID, stale confirmation, and duplicate request; unauthorized calls fail and retry leaks no identity/state. Evidence: `.omo/evidence/glim-production-roadmap/task-5/`.
  Commit: Y | `feat(account): complete compliant account deletion`

- [x] 6. Make UGC safety and moderation store-compliant
  What to do / Must NOT do: Add versioned terms/community-standards acceptance before first post/comment; server-enforced length/control-character/URL/spam/profanity/objectionable-content filter; moderation status/queue and appeal metadata; rate-limited reports; in-app report for post/comment/user; block user; functional support page/contact; moderator SLA/notification/dashboard states; retention and audit trail. Do not rely on client keyword checks or silently shadow-ban.
  Parallelization: Wave 1 | Blocked by: 1, 2, 3 | Blocks: 12-16
  References: `index.html:4366-4383`, `index.html:4667`, `index.html:5239-5355`, `index.js:3520-3666`, `index.js:5137-5230`, `admin.js:38-145`, `supabase/migrations/20260703030000_moderation_reports.sql`
  Acceptance criteria: unaccepted users cannot create UGC; accepted clean content publishes; prohibited fixtures are rejected or quarantined with Korean user feedback; all public content/user cards expose report/block paths; moderator actions and response timestamps are auditable; support URL/email work.
  QA scenarios: Happy, accept current terms, publish clean Korean text, report it from another user, block the author, resolve the report, and confirm immediate visibility changes. Failure, bypass UI with REST/RPC prohibited content, stale terms version, report flood, or banned account; server denies/quarantines without exposing filter internals. Evidence: `.omo/evidence/glim-production-roadmap/task-6/`.
  Commit: Y | `feat(safety): enforce UGC policy and moderation`

- [x] 7. Harden the web client, dependencies, and Render delivery
  What to do / Must NOT do: Replace unsafe dynamic HTML sinks with DOM/text construction or reviewed escaping, remove inline event handlers in security-sensitive flows, pin Supabase/Firebase/font dependencies where practical, implement CSP and Render headers, validate outbound URLs, keep auth tokens out of logs, and add explicit offline/error states. Configure HSTS only after HTTPS and subdomains are confirmed. Preserve current visual behavior and bump static cache versions.
  Parallelization: Wave 1 | Blocked by: 1, 3 | Blocks: 8, 13-16
  References: `index.html:51-63`, all inline `onclick`/`onchange` attributes, `index.js:536-547`, ast-grep 44-sink inventory, `admin.js`, `firebase-messaging-sw.js`, Render static-site headers
  Acceptance criteria: source rule rejects unreviewed HTML sinks/inline handlers; CSP report shows no unexpected violations; headers include appropriate CSP, HSTS after rollout, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and frame protection; browser regression is green.
  QA scenarios: Happy, load every view under enforced CSP with OAuth/push/BGM/static assets working. Failure, execute stored/reflected XSS payloads, `javascript:` URLs, framing, MIME confusion, and blocked third-party origins; no execution/navigation/data leak occurs. Evidence: `.omo/evidence/glim-production-roadmap/task-7/`.
  Commit: Y | `fix(web): harden browser delivery and DOM sinks`

- [ ] 8. Create deterministic Capacitor 8 iOS and Android packages
  What to do / Must NOT do: Add pinned Capacitor 8 core/CLI/iOS/Android packages and required official plugins; create an allowlist copy/bundle script to `dist/`; initialize `capacitor.config.ts` with app ID `com.glimfactory.glim`, app name `글림`, local `webDir`, and no production `server.url`; generate/commit maintainable `ios/` and `android/` projects; exclude admin/backend/planning/secrets; configure release/debug variants and reproducible versioning.
  Parallelization: Wave 2 | Blocked by: 4, 7 | Blocks: 9-12, 14-16
  References: `index.html`, `index.js`, `manifest.json`, `image/`, `.gitignore`, Capacitor v8 docs, approved identifier/domain
  Acceptance criteria: `npm run package:web && npx cap sync` succeeds from clean checkout; packaged asset manifest contains only approved runtime files; `server.url` absent in release; `./gradlew bundleRelease` and Xcode 26 archive preflight compile; installed apps start without network to an explicit offline state.
  QA scenarios: Happy, install debug builds and exercise startup/navigation on one supported iPhone and Android device. Failure, packaging test seeds a forbidden file and a remote `server.url`; build gate fails before native sync. Evidence: `.omo/evidence/glim-production-roadmap/task-8/`.
  Commit: Y | `feat(native): add Capacitor iOS and Android shells`

- [ ] 9. Implement native OAuth, verified links, and session handling
  What to do / Must NOT do: Add platform adapter using native Sign in with Apple on iOS, secure external-browser PKCE for Google/Kakao, exact Supabase redirect allowlists, verified `https://glimfactory.com` callbacks, app URL listeners, session exchange, logout, account-switch, cancellation, and cold-start restoration. Publish AASA and `assetlinks.json`; use Play signing fingerprint for production. Do not use embedded credential WebViews, wildcard production redirects, or `capacitor://localhost` as the public identity.
  Parallelization: Wave 2 | Blocked by: 5, 8 | Blocks: 12, 14-16
  References: `index.js:2656-2666`, `supabase/config.toml:159-195`, `index.html:4311-4362`, `https://glimfactory.com`, Supabase native deep-linking docs, Apple Associated Domains, Android App Links
  Acceptance criteria: web OAuth remains green; iOS Apple/Google/Kakao and Android Google/Kakao complete or cancel safely; exact redirect/domain verification passes; sessions persist only in platform-private storage appropriate to the threat model; logout clears local and server-visible device state.
  QA scenarios: Happy, sign in from logged-out cold start on each provider/platform and return to the intended tab. Failure, tamper state/nonce/code/host, replay callback, deny provider consent, and open malicious lookalike URLs; session is not created and errors remain non-sensitive. Evidence: `.omo/evidence/glim-production-roadmap/task-9/`.
  Commit: Y | `feat(auth): add secure native sign-in and app links`

- [ ] 10. Unify web and native push delivery
  What to do / Must NOT do: Migrate `push_subscriptions` to an explicit platform/endpoint-kind schema with per-install ownership, rotation, timestamps, preferences, disable/revoke, and stale cleanup. Preserve web FID. Add Firebase Android and Apple apps; configure APNs key in Firebase; bridge native Firebase Messaging registration to a supported FID/FCM target; generate platform-specific FCM payloads and deep-link actions. Never treat APNs device tokens as FCM FIDs or commit service/APNs private keys.
  Parallelization: Wave 2 | Blocked by: 2, 4, 8 | Blocks: 12, 14-16
  References: `index.js:2805-3250`, `push-config.js`, `firebase-messaging-sw.js`, `supabase/migrations/20260702020000_push_notifications.sql`, `supabase/functions/send-push/index.ts:193-365`, `PUSH_SETUP.md`, Firebase current FID/FCM docs
  Acceptance criteria: web, Android, and iOS installations register distinctly; preferences and logout/account deletion revoke the correct installation; likes/comments/follows/notices deliver once; malformed/forged/broadcast requests are denied; 404/stale endpoints are removed.
  QA scenarios: Happy, two accounts on three platforms receive and tap each category into the correct content. Failure, use wrong target type, rotated endpoint, disabled preference, non-moderator broadcast, duplicate event, and self-notification; sent count is zero/denied and no device alert appears. Evidence: `.omo/evidence/glim-production-roadmap/task-10/`.
  Commit: Y | `feat(push): support verified web and native delivery`

- [ ] 11. Add native-quality integrations and resilient UX
  What to do / Must NOT do: Route share through OS share sheet, add restrained haptics to navigation/reactions, observe connectivity and show retry/offline state, handle safe areas/status bar/keyboard/back gestures, generate adaptive icons/splash assets, pause/resume BGM with app lifecycle, and provide permission-denied fallbacks. Do not request contacts, location, microphone, broad photo storage, tracking, or any permission not required by a visible feature.
  Parallelization: Wave 2 | Blocked by: 8 | Blocks: 13-16
  References: `index.js:938-1027`, `index.js:1379-1555`, `index.js:3300-3518`, `index.html` navigation/sheets, `image/app-logo.png`, `manifest.json`
  Acceptance criteria: native builds demonstrate at least push, verified links, OS share, haptics, connectivity/offline, safe-area, lifecycle audio, and branded launch assets; permission manifests contain only justified capabilities; browser PWA remains functional.
  QA scenarios: Happy, run the native interaction matrix on small/large devices, dark/light theme, online/offline, foreground/background. Failure, deny notifications/photos, lose network mid-request, press Android back in sheets, interrupt audio, and relaunch from killed state; no crash, trap, or data loss. Evidence: `.omo/evidence/glim-production-roadmap/task-11/`.
  Commit: Y | `feat(native): add app-quality platform integrations`

- [ ] 12. Produce legal, privacy, support, and store metadata artifacts
  What to do / Must NOT do: Update Korean privacy/terms/community standards for actual Supabase/Firebase/native data flows, retention, deletion, moderation, overseas processing, permissions, and contacts; publish `/privacy`, `/terms`, `/community`, `/support`, `/account-delete`; create Apple privacy label and `PrivacyInfo.xcprivacy`; create Google Data safety answers; age/content ratings; store name/subtitle/descriptions/keywords/release notes; reviewer account/instructions; icon/screenshot matrices. Obtain legal review where required; do not invent compliance claims.
  Parallelization: Wave 3 | Blocked by: 5, 6, 8-11 | Blocks: 14-16
  References: `index.html:4892-5453`, approved domain/market, App Store privacy details/account deletion/review guidelines, Google User Data/Data safety/UGC/content rating policies
  Acceptance criteria: every declared data type maps to code/SDK/database evidence; all URLs return HTTPS 200 without login; in-app and store declarations agree; Korean metadata fits current character/image requirements; review credentials expose only a controlled test account.
  QA scenarios: Happy, automated link checker and metadata schema validate every artifact; screenshots match the submitted build. Failure, compare a deliberately mismatched data-map fixture and broken policy URL; release gate fails with field-level differences. Evidence: `.omo/evidence/glim-production-roadmap/task-12/`.
  Commit: Y | `docs(release): add policy and store submission artifacts`

- [ ] 13. Pass web regression, accessibility, performance, and offline gates
  What to do / Must NOT do: Run complete Chromium/WebKit/mobile browser journeys, keyboard/screen-reader semantics, Korean text scaling, color contrast, reduced motion, network failure, cached shell behavior, and performance budgets against `https://glimfactory.com`. Verify Render headers and canonical redirects. Do not cache authenticated Supabase responses or conceal failures behind optimistic UI.
  Parallelization: Wave 3 | Blocked by: 3, 7, 11 | Blocks: 14-16
  References: all user views in `index.html`, `index.js:1076-1555`, `firebase-messaging-sw.js`, Render static-site docs, `https://glimfactory.com`
  Acceptance criteria: all critical journeys pass at supported mobile widths; WCAG-oriented automated checks have no serious/critical findings; no Korean clipping; offline shell and explicit data-unavailable states work; security headers and redirects match policy; syntax/test suites green.
  QA scenarios: Happy, Playwright runs anonymous and two-account authenticated suites against production candidate with traces/screenshots. Failure, block Supabase/Firebase/CDN, use 200% text, keyboard-only navigation, and malformed deep links; app remains operable and honest. Evidence: `.omo/evidence/glim-production-roadmap/task-13/`.
  Commit: Y | `test(web): enforce production quality gates`

- [ ] 14. Build, sign, and validate the iOS TestFlight release
  What to do / Must NOT do: On macOS with Xcode 26+, register `com.glimfactory.glim`, configure Associated Domains/Sign in with Apple/Push capabilities, Firebase Apple app/APNs key, privacy manifest, signing profiles, version `1.0.0`, archive, validate, upload to TestFlight, add Korean beta metadata, and run internal/external beta review as needed. Keep signing material in Keychain/Apple systems, never Git.
  Parallelization: Wave 3 | Blocked by: 4-13 | Blocks: 16
  References: `ios/`, Apple Developer/App Store Connect requirements, `https://glimfactory.com/.well-known/apple-app-site-association`, approved identifier
  Acceptance criteria: Xcode archive and App Store validation succeed with no blocking warning; TestFlight build installs on physical iPhone; OAuth, deletion, UGC safety, push, links, share, offline, and lifecycle matrix passes; crash-free beta evidence and reviewer notes exist.
  QA scenarios: Happy, install TestFlight build on clean physical device and execute the signed release checklist. Failure, use expired session, revoked Apple credential, denied push, bad link, blocked content, and offline launch; secure fallback/no crash. Evidence: `.omo/evidence/glim-production-roadmap/task-14/`.
  Commit: N | Store signing/upload operation; source fixes use separate scoped commits.

- [ ] 15. Build, sign, and validate the Google Play release
  What to do / Must NOT do: Target API 35 or current higher requirement, set `com.glimfactory.glim`, version `1.0.0`/monotonic code, create protected upload key, enroll in Play App Signing, build signed AAB, upload internal test, verify Play-generated APK/App Links fingerprint, complete policy forms, and run pre-launch report. Inspect account type: if personal and created after 2023-11-13, run a closed test with at least 12 continuously opted-in testers for 14 days and apply for production; if organization, record verification and skip only that personal-account gate.
  Parallelization: Wave 3 | Blocked by: 4-13 | Blocks: 16
  References: `android/`, Google target API/AAB/Play App Signing/account-deletion/UGC/testing policies, `https://glimfactory.com/.well-known/assetlinks.json`, approved identifier
  Acceptance criteria: signed AAB accepted; Play App Signing active; internal/closed build installs from Play; App Links verified with Play certificate; pre-launch report has no crash/security blocker; required tester/account branch receipt exists.
  QA scenarios: Happy, install Play-distributed build on clean Android 15+ device and execute signed release checklist. Failure, revoked/denied permission, offline launch, bad App Link, blocked UGC, deletion retry, process death, and back navigation; secure fallback/no crash. Evidence: `.omo/evidence/glim-production-roadmap/task-15/`.
  Commit: N | Store signing/upload operation; source fixes use separate scoped commits.

- [ ] 16. Submit, stage, monitor, and close the Korea 1.0 launch
  What to do / Must NOT do: Freeze release candidate, verify all declarations against the exact binary, submit Apple/Google with reviewer credentials/notes, classify and fix every rejection, rerun affected and full critical QA, then release manually to Korea using staged rollout (Google percentage ramp; Apple manual/phased availability where applicable). Monitor crashes, auth, Edge errors, push failures, moderation queue/SLA, deletion, and support. Define stop/rollback thresholds and preserve previous web/native artifacts.
  Parallelization: Wave 4 | Blocked by: 12-15 | Blocks: final verification
  References: all prior evidence, store consoles, Render deploy history, Supabase/Firebase logs, `.omo/plans/glim-production-roadmap.md`
  Acceptance criteria: both store versions approved and available in Korea; production domain/policy/support links healthy; no threshold breach through the observation window; rollback drill and post-launch owner/runbook complete.
  QA scenarios: Happy, verify public listings, install from each store, complete first-run/core loop/push/deletion-support discovery, and observe healthy metrics. Failure, simulate release halt criteria using staging/test channels, execute rollback/unpublish/Render rollback communication drill without deleting user data. Evidence: `.omo/evidence/glim-production-roadmap/task-16/`.
  Commit: N | Operational release action.

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit: map every Must have/guardrail/todo acceptance criterion to a fresh artifact; reject missing or inferred evidence.
- [ ] F2. Code/security review: review full diff, RLS/RPC/Edge attack matrix, dependency/SBOM results, MASVS mapping, native manifests/entitlements, secret scan, and store declarations; unconditional approval required.
- [ ] F3. Real manual QA: install the exact TestFlight and Play-distributed candidates plus load production web; execute anonymous, two-account, moderator, deletion, UGC, OAuth, push, links, offline, permission-denial, and upgrade journeys on physical devices.
- [ ] F4. Scope fidelity: prove no remote production WebView, admin mobile assets, framework rewrite, private credential, unrelated feature, or unapproved data collection entered the release.

## Commit strategy

## Success criteria
- Commit source changes atomically by todo using Conventional Commits; never commit signing/store credentials.
- Each source commit must pass its scoped checks and leave the repository deployable.
- Native signing/upload and store-console actions are evidence-bearing operations, not commits.
- Suggested final source sequence: quality foundation → Supabase reproducibility → characterization → security → account deletion → UGC safety → web hardening → native shell → auth/links → push → native UX → policies/metadata → QA fixes.
- Do not stage or commit automatically unless the user explicitly requests Git actions.
- `https://glimfactory.com` is the canonical healthy production origin; `www` redirects to it over valid TLS.
- All repository-referenced backend/storage/function contracts can be recreated and verified without undocumented SQL.
- Adversarial RLS/RPC/Edge/UGC/account-deletion tests pass and private credentials are absent from source/binaries.
- Web critical journeys and accessibility/security headers pass without regressing the current product.
- iOS and Android release builds use `com.glimfactory.glim`, local bundled assets, and review-defensible native integrations.
- OAuth, push, deep links, report/block/moderation, and account deletion pass on physical iOS/Android store-track builds.
- Apple privacy/Google Data safety/terms/privacy/support/deletion declarations match observed behavior.
- TestFlight and Google Play testing gates pass, including the conditional 12-testers/14-days requirement when applicable.
- Both version 1.0 listings are approved and available in South Korea, with monitoring and rollback runbooks proven.

---
slug: glim-production-roadmap
status: plan-written
intent: clear
pending-action: start implementation or run high-accuracy review
approach: Security-gate the existing PWA, package local web assets in Capacitor 8 native shells, add store-compliant native authentication/push/deep links and UGC controls, then pass TestFlight/Play testing and submit Korea-first releases.
---

# Draft: glim-production-roadmap

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->
C1 | A security release gate proves least-privilege database, authenticated Edge Functions, safe DOM rendering, abuse controls, secret hygiene, and recoverable operations | active | `supabase/RLS_AUDIT.sql`, `supabase/migrations/`, `index.js`, `admin.js`, `supabase/functions/send-push/index.ts`
C2 | Accounts, profiles, OAuth, account deletion, roles, and local session storage behave safely on web, iOS, and Android | active | `index.js:1162`, `index.js:2516`, `index.js:2656`, `index.js:3704`, `admin.js:19`
C3 | Public UGC has pre-publication filtering, versioned terms acceptance, report/block flows, timely moderation, support contact, and auditable enforcement | active | `index.html:4366`, `index.js:3520`, `index.js:5137`, `admin.js:38`, `supabase/migrations/20260703030000_moderation_reports.sql`
C4 | Capacitor 8 packages allowlisted local assets into signed iOS and Android projects with native-quality navigation, sharing, haptics, network/offline, and safe-area behavior | active | `index.html`, `index.js`, `manifest.json`, new `package.json`, `capacitor.config.ts`, `ios/`, `android/`
C5 | Web, iOS, and Android receive preference-aware Firebase push and route verified universal/app links without exposing credentials | active | `index.js:2805-3250`, `firebase-messaging-sw.js`, `supabase/functions/send-push/index.ts:193`, new native Firebase configuration
C6 | TestFlight and Google Play test tracks produce review-ready binaries, policy declarations, metadata, screenshots, evidence, rollback, and staged Korea-first production releases | active | new store metadata/evidence paths, Apple/Google console checklists

## Open assumptions (announced defaults)
<!-- Intent is UNCLEAR: research resolves ambiguity, defaults are adopted (not asked), and each is surfaced in the plan's human TL;DR for veto. -->
<!-- assumption | adopted default | rationale | reversible? -->
The desired outcome | Security remediation followed by real Apple App Store and Google Play launches | The user explicitly narrowed the goal | No
Runtime architecture | Keep deployment buildless and preserve classic-script globals/inline handlers until characterization coverage exists | `index.html:61-63` and project conventions make script order and globals a current runtime contract | Yes
Implementation priority | Close missing server contracts and authorization inconsistencies before adding product breadth | Account deletion and avatar setup are called by the client but absent; role checks differ across surfaces | Yes
Database evolution | Add new timestamp migrations; never rewrite applied migrations | Repository and nested Supabase instructions define append-only history | No for already-applied migrations
Authorization source | Auth UUID plus `user_roles`/`is_moderator()` is authoritative; email is display/configuration data only | Existing migrations already establish this model, while client and push broadcast still compare a hard-coded email | Yes
Anonymous experience | Keep public feed/profile reading available; require authenticated server-verified writes | Current RLS and UI follow this split | Yes
Quality tooling | Add development-only Node-based checks and browser tests without introducing a production bundle step | The project has no package/test/CI surface, while runtime deployment is intentionally static | Yes
Feed direction | Replace the fixed 100-row client shuffle with cursor pagination and deterministic server-backed ranking, retaining mood and recency semantics | Current ranking is capped, device-local, random inside the comparator, and cannot scale consistently | Yes
Native packaging | Recommend Capacitor 8 for both iOS and Android, with allowlisted local assets and no production `server.url` | One native runtime minimizes platform drift and supports native APIs; a thin remote WebView is a review risk | Yes before first store record; effectively no after identifiers/releases
Native build boundary | Keep the public web deployment buildless; add a deterministic native packaging step that copies only runtime assets to `dist/` and bundles a small native bridge | Capacitor plugins use module imports, while copying the repository root would package SQL, admin, and development files | Yes
Native value | Add native push, universal/app links, OS share sheet, haptics, connectivity/offline state, status bar/safe-area handling, and native launch assets | Apple requires functionality beyond a repackaged website and Google rejects low-quality WebViews | Yes
Store market | Recommend South Korea only for version 1.0, Korean metadata, no Kids category, free app, no purchases/ads | Matches current Korean-only product/legal copy and avoids unverified localization and commerce requirements | Yes before submission
Security standard | Use OWASP MASVS control groups for native surfaces and repository-specific RLS/Edge adversarial tests for backend authorization | Gives an auditable mobile threat-model baseline without pretending to provide certification | Yes
Testing | TDD for security/server contracts; characterization tests before client refactors; automated browser/native smoke tests plus physical-device/manual store-track evidence | Security behavior must fail first, and store-only behavior cannot be proven by unit tests | Yes
Hosting | Keep Render as the production static host and connect `glimfactory.com` as its canonical custom domain | The user confirmed the existing host; Render supplies managed TLS, CDN, redirects, and response-header configuration | Yes
Product scope | Do not add chat, monetization, subscriptions, ads, generative AI, or a visual rebrand | These are not required for launch and add policy surface | Yes

## Findings (cited - path:lines)

- Product intent: a Korean, mobile-first “text short-form” experience where users vertically consume concise emotional writing, attach a mood and optional BGM, and preserve reactions around their own writing (`manifest.json`, `index.html:3996-4009`, `index.html:4180-4228`, `index.html:4274-4295`).
- The browser surface is a buildless SPA with home, contextual feed, explore/search, writing, BGM picker, notifications, own/other profiles, settings, legal pages, account center, and notice detail, all housed in `index.html`; Supabase CDN, public push config, then deferred `index.js` is the required load order (`index.html:61-63`, `index.html:3996-5670`).
- Startup restores the Supabase session, creates/synchronizes a profile, loads blocks and engagement state, initializes push, fetches the feed, resolves notification deep links, and wires gestures and UI helpers (`index.js:1162-1293`).
- Core creation is intentionally constrained to 5-120 characters and at most 12 visual lines, with a required mood and optional curated BGM (`index.js:47-50`, `index.js:141-160`, `index.js:5549-5609`).
- The current home feed fetches at most 100 newest rows, filters blocked authors, then sorts client-side by local mood scores, likes, age, seen status, and random values generated inside the comparator (`index.js:4176-4237`). This is non-paginated and non-deterministic.
- Supabase migrations harden engagement through `post_likes`, `comment_likes`, `bookmarks`, toggle/import RPCs, count triggers, restricted grants, post/comment RLS, notification verification, operator notice RPCs, reserved identities, and account cleanup (`supabase/migrations/20260703040000_secure_content_rls.sql`).
- Moderation has server-side roles, report snapshots, report submission and moderation RPCs, suspension/ban state, and write-enforcement triggers (`supabase/migrations/20260703030000_moderation_reports.sql`). The admin page correctly gates entry through `is_moderator()` (`admin.js:19-36`).
- Authorization is inconsistent across surfaces: the main UI exposes the admin menu through `ADMIN_EMAIL` (`index.js:4`, `index.js:2516-2522`) and announcement broadcast in `send-push` authorizes the same hard-coded email (`supabase/functions/send-push/index.ts:227-234`) instead of the server role model.
- Push requests authenticate the caller, validate like/comment/follow relationships, honor per-category subscription preferences, deduplicate sends, use FCM HTTP v1, delete 404 subscriptions, and deep-link to content (`supabase/functions/send-push/index.ts:193-365`). Firebase guidance supports service-worker background handling and secure click URLs.
- The repository is not self-contained: it assumes pre-existing base tables, enables a missing `supabase/seed.sql`, lacks the invoked `delete-account` Edge Function, and lacks the avatar storage setup referenced by client error handling (`AGENTS.md:100-104`, `supabase/AGENTS.md:47`, `supabase/config.toml:67-72`, `index.js:2182-2199`, `index.js:3704-3729`).
- The PWA has a manifest and an FCM worker, but the worker currently handles background notifications/clicks only; it has no install/cache/fetch path for an offline app shell (`manifest.json`, `firebase-messaging-sw.js:1-58`). Current PWA guidance treats offline resilience and service-worker behavior as core reliability properties.
- Legal terms and privacy policy are present, including service definitions and an effective date (`index.html:4892-5204`, `index.html:5210-5453`), while customer support is still a placeholder (`index.html:4667`).
- There is no package manifest, automated test suite, CI, or hosting configuration. Current validation is syntax checks, linked Supabase checks, RLS audit, and manual browser/device regression (`AGENTS.md:77-103`, `supabase/AGENTS.md:57-70`).
- The working tree was clean before planning (`git status --short --branch` returned only `master...origin/master`).
- Baseline JavaScript syntax checks passed for `index.js`, `admin.js`, `firebase-messaging-sw.js`, and `push-config.js` on 2026-07-04.
- External primary guidance used for defaults: Supabase recommends RLS-backed authorization and authenticated Edge Function headers; Firebase documents service-worker background message handling and secure click targets; web.dev describes offline capability and installability as PWA reliability expectations.
- Scope change on 2026-07-04: the target is now security remediation plus real App Store/Google Play launch, so native packaging and store operations are in scope.
- Apple Guideline 1.2 requires UGC apps to filter objectionable submissions, provide in-app reporting with timely responses, block abusive users, and publish contact information. Glim has reporting/blocking/moderation, but no explicit pre-publication filter, moderation SLA, or functional support center (`index.html:4667` remains “준비 중”).
- Google Play UGC policy similarly requires terms/user-policy acceptance, ongoing moderation, in-app reporting for users/content, and blocking. The current “social login means agreement” copy (`index.html:4366-4383`) is not a versioned, auditable consent record.
- Apple Guideline 4.2 rejects apps that are merely repackaged websites; Google rejects low-quality or unauthorized WebViews. Native wrapper work must therefore add real platform integration and bundle local assets.
- Apple requires in-app account deletion for apps with account creation, including associated UGC. Google requires both an in-app deletion path and a public web deletion-request URL. The client has an in-app flow but invokes a missing `delete-account` Edge Function (`index.js:3668-3729`).
- Apple social-login rules require an equivalent privacy-preserving login when Google/Kakao is offered. Apple login is visible (`index.html:4311-4362`), but native OAuth callbacks, token revocation on deletion, and provider configuration still need end-to-end proof.
- App Store privacy labels and Google Play Data safety declarations must include data collected by Supabase, Firebase, and any native SDK. Privacy policy URLs must be public, active, consistent with in-app behavior, and include retention/deletion practices.
- Apple uploads now require Xcode 26+ and iOS 26 SDK. Google Play new apps/updates currently require target API 35+, an AAB, and Play App Signing; package names and Apple bundle IDs become effectively permanent after release creation/upload.
- Newly created personal Google Play developer accounts may require at least 12 continuously opted-in closed testers for 14 days before production access. This is an account-dependent schedule gate.
- Capacitor documentation is currently v8 and supports adding iOS/Android to an existing web app. Its production binary should contain copied local web assets; a remote `server.url` is reserved for development/live reload.
- Capacitor's official push plugin returns an APNs token on iOS and an FCM token on Android, while Glim's web flow and Edge Function use the newer Firebase Installation ID target. The native plan must deliberately normalize endpoint type/platform and use Firebase Messaging on Apple platforms rather than sending an APNs token to the FCM `fid` field.
- Current web push is not legacy-token code: Firebase's current JavaScript SDK supports `register()`/`onRegistered()` with FID, and FCM HTTP v1 officially accepts `message.fid` (`index.js:2939-3082`, `supabase/functions/send-push/index.ts:298-328`).
- Current OAuth redirects to `${window.location.origin}/` (`index.js:2656-2660`). A Capacitor app needs external-browser OAuth plus verified universal/app links, an allowlisted callback, and secure session exchange; `capacitor://localhost` must not become the production identity URL.
- A structural scan found 44 `innerHTML` assignments across `index.js` and `admin.js`. Core post and comment renderers create static shells and put database values into `textContent` (`index.js:3807-3925`, `index.js:5022-5068`), but every remaining sink still needs taint review and a regression rule before release.
- The current `.gitignore` excludes environment and Firebase service-account files but does not yet cover Apple signing keys, Android upload keystores, provisioning profiles, native build outputs, or store API credentials.
- OWASP MASVS defines mobile controls for storage, cryptography, authentication, network, platform interaction, code/dependencies, resilience, and privacy; the plan will map launch evidence to these control groups without claiming OWASP certification.
- Owner-decision update: packaging/test strategy (question 1) and distribution/account constraints (question 3) are intentionally deferred. The user will purchase a production domain before resolving the permanent app identity.
- Domain decision: the user purchased `glimfactory.com`. Use `https://glimfactory.com` as the recommended canonical production origin and redirect `https://www.glimfactory.com` to it after the hosting target is known.
- Hosting decision: the user confirmed Render. The repository itself contains no `render.yaml`, `onrender.com` URL, or other Render metadata, so the exact service subdomain remains an external dashboard value. Render's current documented Gabia-compatible setup is root A `216.24.57.1`, `www` CNAME to the service's `*.onrender.com` hostname, no conflicting `AAAA`, followed by Render verification and managed TLS issuance.
- Live domain evidence on 2026-07-04: `glimfactory.com` resolves to `216.24.57.1`; `www.glimfactory.com` resolves to `glim-text-shortform.onrender.com`; no AAAA answer exists; HTTP returns `301 Location: https://glimfactory.com/`. HTTPS still returned a TLS handshake failure immediately after verification, so certificate issuance was still propagating and auth cutover must wait for a successful HTTPS probe.
- Final domain evidence on 2026-07-04: Render reports both domains verified with certificates issued; `curl -I https://glimfactory.com` returns `200 OK`; `curl -I https://www.glimfactory.com` returns `301 Location: https://glimfactory.com/`.
- Owner approval: Capacitor 8 for both platforms, TDD for security/server contracts, characterization-first client changes, `https://glimfactory.com`, permanent identifier `com.glimfactory.glim`, and Korea-only version 1.0 are approved.
- Developer account fact: Google account was created in early 2026. Account type was provided as personal/organization still being prepared, so the execution plan contains a deterministic console-inspection branch: a qualifying personal account must complete the 12-testers/14-days gate; an organization account records verification and skips only that personal-account requirement.
- The production domain should be fixed before Apple/Google app identifiers and verified links are finalized. Apple Universal Links require an `apple-app-site-association` file and matching Associated Domains entitlement; Android App Links require `/.well-known/assetlinks.json` with the permanent package name and Play signing certificate fingerprint.

## Decisions (with rationale)

1. Build the roadmap as gated release trains: security and backend completeness must pass before native packaging, which must pass before store-track submission.
2. Use six independently verifiable components (C1-C6) so security, identity, UGC safety, native quality, push/deep links, and store operations cannot be hidden behind one broad “publish app” task.
3. Make the repository reproducible before packaging the client: capture the base schema contract, add the missing avatar bucket/policies and `delete-account` function, resolve the seed mismatch, and document secret/public configuration boundaries.
4. Normalize every privileged check to `is_moderator()` or an equivalent server-owned UUID role lookup. Browser email checks may only control non-authoritative presentation after server state has been loaded.
5. Preserve buildless deployment and current Korean product copy. Introduce test tooling as development infrastructure, not as a runtime framework migration.
6. Characterize the global/inline-handler contracts before security-sensitive DOM refactors. Add a source rule that rejects database/user strings in HTML sinks, then remove or contain inline handlers enough to support a meaningful Content Security Policy.
7. Package only explicit runtime assets into Capacitor; exclude `admin.html`, `admin.js`, `supabase/`, planning artifacts, and development credentials from mobile binaries.
8. Keep privileged moderation web-only. The consumer mobile binary will never expose the admin UI, and every moderation capability remains server-role protected.
9. Normalize push subscriptions to an endpoint-kind model (`web_fid`, `android_fid`, `ios_fid` or an explicitly supported transitional token type), with per-install ownership, rotation/revocation, category preferences, and platform-specific payloads.
10. Use native or external-browser OAuth with PKCE/deep-link return. Native Sign in with Apple is preferred on iOS; token revocation is part of account deletion.
11. Add pre-publication content filtering, server rate limits, versioned terms acceptance, moderation SLA/queue observability, and public support contacts before store submission.
12. Require exact release artifacts: signed IPA/TestFlight build, signed AAB/internal or closed-track build, SBOM/dependency scan, MASVS checklist, RLS audit, privacy/data maps, review account/instructions, screenshots, metadata, and rollback receipts.
13. README will be the human-facing security-and-launch roadmap; `.omo/plans/glim-production-roadmap.md` will hold the executor-grade task graph.

## Scope IN

- Product vision, current architecture, security findings, native architecture, store-policy map, launch gates, timeline dependencies, and rollback strategy in `README.md`.
- A dependency-ordered executor plan covering schema/reproducibility, RLS/RPC/Edge hardening, account lifecycle, storage, OAuth, UGC filtering/moderation, native packaging, deep links, push, privacy declarations, store assets, beta tracks, submission, and staged rollout.
- Additive SQL migrations and Edge Functions required to make checked-in client behavior deployable from the repository.
- Capacitor 8 iOS/Android projects and a minimal native bridge/package pipeline while keeping public web deployment buildless.
- Native integrations that provide review-defensible app value: push, share sheet, deep links, haptics, connectivity/offline state, safe areas, launch assets.
- Public HTTPS support, privacy, terms/community standards, and web account-deletion request surfaces.
- Exact syntax, dependency/SBOM, database lint/dry-run, RLS adversarial checks, browser journeys, iOS/Android physical-device tests, TestFlight/Play-track checks, store declarations, staged rollout, and cleanup receipts.

## Scope OUT (Must NOT have)

- No product-code implementation during `ulw-plan`.
- No frontend framework rewrite or full TypeScript conversion. A minimal native packaging/bundle step is allowed; public web deployment remains static.
- No visual rebrand or broad copy rewrite.
- No chat, direct messaging, monetization, subscriptions, ads, generative AI, or unrelated social features.
- No edits to already-applied timestamp migrations; use follow-up migrations.
- No service-role key or Firebase service account material in browser files or Git.
- No remote web runtime (`server.url`) in production native binaries and no over-the-air code path that bypasses store review.
- No moderation/admin console inside the consumer mobile binary.
- No hosting-provider migration.
- No caching of authenticated/private API responses in the service worker.
- No claim that store approval is guaranteed; the plan drives every documented prerequisite and records reviewer feedback/retry loops.

## Open questions

None blocking. Apple/Google account type is resolved by inspecting the actual console account during execution and following the explicit branch in the plan.

## Approval gate
status: approved
approved action: Write `.omo/plans/glim-production-roadmap.md` and `README.md`.
approved approach: Security-first Korea launch using Capacitor 8 local native shells, native OAuth/push/deep links, store-compliant UGC moderation/account deletion/privacy, and TestFlight/Play staged release gates.
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->

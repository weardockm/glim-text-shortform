# PROJECT KNOWLEDGE BASE

**Generated:** 2026-07-03 (Asia/Seoul)
**Commit:** ca51035
**Branch:** master

## OVERVIEW

글림(Glim)은 빌드 단계 없이 배포되는 한국어 텍스트 숏폼 PWA다. 브라우저 UI는 거대한 `index.html`/`index.js` 전역 스크립트 쌍에, 인증·데이터·스토리지는 Supabase에, 웹 푸시는 Firebase Cloud Messaging과 Supabase Edge Function에 의존한다.

## STRUCTURE

```text
./
├── index.html                  # 메인 PWA의 CSS, 15개 뷰, 시트 마크업
├── index.js                    # 전역 상태, 라우팅, 데이터, 렌더링, 제스처, 오디오, 푸시
├── admin.html / admin.js       # 신고 검토와 운영자 공지 화면
├── firebase-messaging-sw.js    # 백그라운드 푸시 표시와 클릭 라우팅
├── push-config.js              # 공개 Firebase 웹 설정과 VAPID 키
├── manifest.json               # standalone PWA 메타데이터
├── image/                      # 앱 로고와 기본 프로필 이미지
└── supabase/                   # SQL 보안 계약과 Deno 푸시 백엔드
```

## WHERE TO LOOK

| Task | Location | Notes |
|---|---|---|
| 앱 셸·뷰·스타일 | `index.html` | `<style>`과 모든 `.app-view`, bottom sheet가 한 파일에 있음 |
| 메인 기능 | `index.js` | 기능 수정 시 대응하는 HTML ID/class/data 속성도 함께 추적 |
| 탭 라우팅 | `index.js:1076` `switchTab` | 홈·탐색·알림·프로필 로드를 분기 |
| 앱 초기화 | `index.js:1162` `init` | 세션→프로필→차단/참여 상태→푸시→피드 순서 |
| 피드 | `index.js:4176` `fetchPosts` | 차단 필터, 로컬 취향 점수, 정렬, DOM 생성의 중심 |
| 글/댓글/참여 | `index.js:4897`, `index.js:5232`, `index.js:5549` | 서버 RPC와 RLS 정책이 클라이언트 계약 |
| 프로필·아바타 | `index.js:1557` 이후 | Supabase Storage 경로와 crop 상태를 함께 다룸 |
| 알림·푸시 | `index.js:3000` 이후 | 설정, 기기 등록, foreground 수신, Edge 호출 |
| 백그라운드 푸시 | `firebase-messaging-sw.js` | 별도 Firebase compat SDK 런타임 |
| 관리자 | `admin.html`, `admin.js` | 이메일 표시가 아니라 `is_moderator` RPC가 권한 기준 |
| DB/RLS/Edge | `supabase/` | 하위 `AGENTS.md` 우선 적용 |
| 푸시 연결 절차 | `PUSH_SETUP.md` | Firebase secret, migration, deploy, HTTPS 테스트 |

## CODE MAP

LSP 서버는 설치되어 있지 않다. 아래 참조 수는 codegraph가 확인한 직접 호출 기준이며 HTML inline handler는 누락될 수 있다.

| Symbol | Type | Location | Refs | Role |
|---|---|---:|---:|---|
| `init` | function | `index.js:1162` | boot | 메인 앱 조립점 |
| `switchTab` | function | `index.js:1076` | 9 | DOM SPA 라우터 |
| `fetchPosts` | function | `index.js:4176` | 8 | 피드 데이터·정렬·렌더링 허브 |
| `fetchNotifications` | function | `index.js:5411` | 4 | 사용자 알림과 운영 공지 통합 |
| `sendPushNotification` | function | `index.js:3252` | 3 | 인증 토큰으로 Edge Function 호출 |
| `createContextFeedPost` | function | `index.js:3807` | feed | 게시글 DOM과 액션 이벤트 구성 |
| `initAdmin` | function | `admin.js:19` | boot | 관리자 RPC 권한 검사 |
| `Deno.serve` | entry point | `supabase/functions/send-push/index.ts:193` | HTTP | FCM 발송·검증·중복 방지 |

## CONVENTIONS

- 빌드리스 classic script 구조다. Supabase CDN → `push-config.js` → deferred `index.js` 로드 순서를 보존한다.
- HTML의 inline event handler가 전역 함수를 호출한다. 함수의 module/private 전환 전 모든 inline handler를 먼저 제거해야 한다.
- `index.html` 또는 스크립트 변경 시 `?v=N` 캐시 버전도 올려 배포된 PWA의 오래된 자산을 피한다.
- 사용자 노출 문구와 법률 문서는 한국어다. 앱 내부 URL과 PWA 자산은 상대 경로를 유지한다.
- DB/사용자 문자열은 `textContent`/`innerText` 또는 `escapeHtml()`을 거친다. raw 문자열을 `innerHTML` 템플릿에 넣지 않는다.
- 브라우저에는 Supabase publishable key와 Firebase/VAPID 공개값만 둔다. 비공개 서비스 계정은 Edge Function secret이다.
- 좋아요·북마크·신고·제재·공지·작성자 동기화는 서버 검증 RPC를 사용한다. 클라이언트 카운터 직접 수정으로 되돌리지 않는다.
- Auth UUID가 소유권의 기준이다. 닉네임은 표시값이며 RLS/알림 권한 식별자로 사용하지 않는다.
- 푸시 카테고리 `likes`, `comments`, `follows`, `announcements`는 브라우저·SQL 기본값·Edge 검증·dedupe 로직 전체에서 동일해야 한다.
- iOS 푸시는 Safari의 홈 화면 설치 PWA와 HTTPS에서만 실제 검증한다.

## ANTI-PATTERNS (THIS PROJECT)

- `index.html`만 또는 `index.js`만 보고 기능을 수정하지 않는다. ID/class/data 속성과 전역 함수 계약을 양쪽에서 추적한다.
- Supabase service-role key나 `FIREBASE_SERVICE_ACCOUNT_JSON`을 브라우저 파일 또는 Git에 넣지 않는다.
- 적용된 timestamp migration을 고쳐 이력을 재작성하지 않는다. 후속 migration으로 함수·정책을 교체한다.
- RLS를 우회하려고 authenticated 역할에 광범위한 table `UPDATE`/`DELETE` 권한을 되돌리지 않는다.
- `supabase/.temp/`를 소스처럼 읽거나 커밋하지 않는다.
- `RLS_AUDIT.sql`에 쓰기 작업을 추가하지 않는다.

## COMMANDS

```bash
# 정적 JavaScript 구문 검사
node --check index.js
node --check admin.js
node --check firebase-messaging-sw.js
node --check push-config.js

# 연결된 Supabase 상태와 SQL 검사
npx supabase migration list --linked
npx supabase db lint --linked --level warning
npx supabase db push --linked --dry-run --yes
npx supabase db push --linked --yes

# 푸시 Edge Function 배포
npx supabase functions deploy send-push --project-ref qdnpeliqtxdglqewbvgg
```

## NOTES

- `package.json`, 번들러, 자동 테스트, CI, 호스팅 설정이 없다. 문법 검사 후 localhost/HTTPS에서 직접 기능을 통과시켜야 한다.
- 최소 수동 회귀 범위: 앱 시작, OAuth 로그인/로그아웃, 피드, 글·댓글, 좋아요·북마크, 프로필/차단, 신고, 관리자 공지, 설치형 PWA 푸시.
- migration은 기존 원격 `posts`, `comments`, `profiles`, `follows`, `blocks`, `notifications` 스키마를 전제로 한다. 현재 파일만으로 빈 DB를 bootstrap할 수 없다.
- `supabase/config.toml`은 seed를 활성화하지만 `supabase/seed.sql`은 없다.
- 클라이언트가 호출하는 `delete-account` Edge Function과 코드가 안내하는 `supabase-avatar-storage-setup.sql`은 현재 저장소에 없다.
- Supabase JS CDN은 `@2` floating 버전이다. 라이브러리 동작 변경 의심 시 실제 로드 버전을 먼저 확인한다.

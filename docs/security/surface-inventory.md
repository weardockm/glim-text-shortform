# 글림 보안 표면 인벤토리

기준일: 2026-07-04. 이 문서는 현재 웹/PWA의 경계를 고정하며, 구현 변경 시 특성화 테스트와 함께 갱신한다.

## 브라우저 저장소

| namespace | 값 | 민감도/정책 |
| --- | --- | --- |
| `glim_mood_scores` | 감성별 로컬 선호 점수 | 낮음, 계정 삭제·로그아웃 정책 검토 |
| `glim_seen_posts` | 최근 본 게시글 ID, 최대 300개 | 중간, 행동 데이터 |
| `glim_engagement_migrated_*` | 참여 상태 마이그레이션 완료 플래그 | 낮음 |
| `glim_explore_search_history` | 최근 검색어, 최대 8개 | 중간, 개인정보처리방침 반영 |
| `glim_theme_preference` | 테마 선택 | 낮음 |
| `glim_notification_preferences_*` | 알림 카테고리 설정 | 중간 |
| `glim_push_fid_*` | Firebase installation identifier | 높음, 로그·공유 금지 |
| `glim_push_onboarding_seen_*` | 푸시 안내 표시 여부 | 낮음 |
| Supabase auth storage | SDK 기본 세션 저장소 | 높음, 실제 로드 SDK 버전과 키명 별도 검증 |

명시적인 `sessionStorage` 사용은 없다. 사용자별 logout/account-delete 정리 코드는 `glim_*`과 과거 참여 키를 대상으로 하며, 서버 세션 폐기와 별도로 검증해야 한다.

## 공개 설정과 외부 origin

| origin/설정 | 용도 | 신뢰 정책 |
| --- | --- | --- |
| `qdnpeliqtxdglqewbvgg.supabase.co` | Auth, REST/RPC, Storage, Edge | publishable key 공개 가능, RLS/RPC 필수 |
| `cdn.jsdelivr.net` | Supabase JS `@2` | floating 버전 제거 대상 |
| `www.gstatic.com/firebasejs/12.15.0` | Firebase 앱·메시징 | 버전은 고정, 허용 CSP origin 필요 |
| `fonts.googleapis.com`, `fonts.gstatic.com` | 글꼴·아이콘 | CSP와 가용성 실패 fallback 필요 |
| Google/Kakao OAuth | 로그인 | 정확한 redirect allowlist, state/PKCE |
| KISA·검찰·ECRM | 법률 안내 외부 링크 | 새 창 격리와 URL 상수 유지 |
| `glimfactory.com` | canonical web/policy/deep-link origin | TLS, canonical redirect, 보안 헤더 |

`SUPABASE_ANON_KEY`, Firebase 웹 설정, VAPID 키는 공개값이다. service-role, Firebase service account, APNs 키, Apple `.p8`, Android keystore는 브라우저·Git·증거 파일에 존재하면 안 된다.

## 데이터 API

### 테이블/버킷

- `profiles`, `posts`, `comments`
- `post_likes`, `bookmarks`, `comment_likes`
- `follows`, `blocks`, `notifications`, `reports`
- `push_subscriptions`
- Storage: `avatars`, 공개 BGM 객체

### 사용자 RPC/Edge

- `toggle_post_like`, `toggle_bookmark`, `toggle_comment_like`
- `submit_content_report`
- 참여 상태 마이그레이션 RPC
- `send-push`
- `delete-account` 호출 계약은 있으나 현재 함수 구현은 저장소에 없음

### 운영자 RPC

- `is_moderator`
- `moderate_report`
- `create_operator_notice`
- `delete_operator_notice`

모든 UUID와 카운터는 요청 본문이 아니라 서버 세션과 서버 계산을 기준으로 검증해야 한다.

## DOM/URL 경계

- `innerHTML` assignment: 44개. 전체 분류는 `dom-sink-inventory.json`.
- 현재 분류: constant 34, safe 10, unsafe 0.
- 게시글·댓글 shell은 정적 HTML을 만든 뒤 UGC를 `textContent`로 대입한다.
- 탐색 사용자/게시글은 `innerText`를 사용한다.
- 알림 템플릿은 외부 필드에 `escapeHtml()`을 적용한다.
- `avatar_url`은 이미지 `src`, `bgm_url`은 오디오 `src`가 되므로 protocol/origin/content-type allowlist가 필요하다.
- 공유 다운로드 링크의 `href`도 허용 URL 검증 대상이다.
- BGM·감성 picker의 inline `onclick`은 데이터가 allowlist/escaped여도 CSP와 회귀 위험 때문에 Todo 7에서 제거한다.

## 권한 경계

- 익명: 공개 게시글 읽기, OAuth 진입.
- 인증 사용자: 자기 UUID로 프로필/UGC/관계/푸시 설치를 관리.
- 운영자: `is_moderator()`가 true인 세션만 신고·공지 RPC 실행.
- 클라이언트 `ADMIN_EMAIL`은 메뉴 표시용일 뿐 권한 근거가 될 수 없다.
- Edge Function은 JWT, actor UUID, category/target, moderator role을 다시 검증해야 한다.

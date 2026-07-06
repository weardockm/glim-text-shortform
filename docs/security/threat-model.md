# 글림 1.0 보안 위협 모델

기준일: 2026-07-04
범위: 웹/PWA 클라이언트, 관리자 웹, Supabase 데이터·인증·스토리지·Edge Function, Firebase 웹 푸시. Capacitor 네이티브 경계는 Todo 8부터 확장한다.

## 보호 자산과 보안 목표

| 자산 | 목표 | 실패 영향 |
| --- | --- | --- |
| Supabase 세션과 사용자 UUID | 토큰 기밀성, UUID 기반 소유권 | 계정 탈취, 타인 데이터 변경 |
| 게시글·댓글·프로필·관계 데이터 | 무결성, RLS 기반 최소 권한 | 사칭, 변조, 대량 스팸 |
| 신고·제재·운영 공지 | 역할 기반 권한, 감사 가능성 | 검열 우회, 운영자 사칭 |
| 푸시 설치 식별자와 선호 | 사용자·설치별 소유권, 최소 보존 | 추적, 오발송, 알림 폭탄 |
| 아바타와 BGM 객체 | 경로 소유권, 안전한 콘텐츠 타입 | 교차 사용자 덮어쓰기, 추적 URL |
| 계정 삭제 기록 | 인증된 요청, 멱등성, 최소 감사 정보 | 삭제 불완전, 개인정보 잔존 |
| 공개 정책·지원 URL | 가용성, 실제 동작과 선언 일치 | 스토어 거절, 법적 신뢰 훼손 |

Supabase publishable key, Firebase 웹 설정, VAPID 공개키는 공개 식별자다. 이 값의 노출 자체를 비밀 유출로 분류하지 않으며, 권한은 RLS·RPC·Edge 검증이 강제해야 한다.

## 행위자

- 익명 방문자: 피드와 공개 프로필을 읽는다.
- 인증 사용자: UGC 작성, 반응, 팔로우, 차단, 신고, 푸시 등록을 수행한다.
- 악의적 사용자: 변조된 REST/RPC 요청, 스팸, 저장형 XSS 문자열, IDOR, 신고 폭주를 시도한다.
- 운영자: 서버의 `is_moderator()` 결과로 신고 처리와 공지를 수행한다.
- 외부 공급자: Supabase, Firebase/Google, Google·Kakao OAuth, CDN, Render.
- 공급망 공격자: floating CDN 패키지나 외부 자산 경로를 오염시킨다.
- 분실 기기 보유자: 남아 있는 브라우저 세션과 로컬 상태에 접근한다.

## 신뢰 경계

```text
사용자 입력/URL
    |
    v
브라우저 DOM + localStorage ---- OAuth 공급자
    |  publishable credentials       |
    v                                v
Supabase Auth/API/RLS/RPC <----- redirect callback
    |          |
    |          +---- Storage (avatars, BGM)
    v
Edge Function (send-push/delete-account)
    |
    v
Firebase Messaging -> 서비스 워커 -> 기기 알림

별도 경계: admin.html -> is_moderator() -> moderation RPC
```

브라우저가 보내는 UUID, 이메일, 닉네임, 카운터, 역할 표시값은 모두 신뢰하지 않는다. 데이터베이스의 `auth.uid()`와 역할 RPC가 권한의 기준이어야 한다.

## 현재 흐름 계약

| 흐름 | 현재 경계 | 보안 계약 |
| --- | --- | --- |
| 시작 | `getSession` 후 프로필·차단·참여 상태, 피드 순서 | 익명 세션도 공개 피드를 읽을 수 있음 |
| OAuth | Google/Kakao, 현재 origin으로 복귀 | 공급자·redirect allowlist와 state 검증은 Supabase 계약 |
| 글·댓글 | `posts`/`comments` 직접 insert | RLS가 UUID 소유권과 필드 무결성을 강제해야 함 |
| 좋아요·북마크·댓글 좋아요 | 서버 RPC | 카운터와 중복은 서버 소유 |
| 팔로우·차단 | 테이블 insert/delete | 자기 UUID와 대상 UUID 관계만 허용 |
| 신고 | `submit_content_report` RPC | 대상·사유·빈도·스냅샷은 서버 검증 |
| 프로필·아바타 | profile upsert, Storage upload | UUID 행·객체 경로 소유권과 MIME 제한 |
| 알림·푸시 | notifications read, `send-push` Edge 호출 | 수신자·카테고리·중복·broadcast 권한 검증 |
| 관리자 | `is_moderator()` 후 moderation RPC | 이메일 표시값이 아닌 역할 데이터가 권한 기준 |
| 삭제 | `delete-account` Edge 호출 | 현재 저장소에는 구현이 없어 출시 차단 |

## 위협과 조치 우선순위

| ID | 위협/악용 경로 | 가능성 | 영향 | 스토어 차단 | 소유 작업 |
| --- | --- | --- | --- | --- | --- |
| TM-01 | 저장소에 `delete-account` 구현이 없어 데이터와 Auth 삭제가 불완전 | 높음 | 치명적 | 예 | Todo 5 |
| TM-02 | 버전 약관 동의와 서버 UGC 사전 필터가 없어 금지 콘텐츠가 즉시 공개될 수 있음 | 높음 | 치명적 | 예 | Todo 6 |
| TM-03 | 직접 테이블 쓰기의 안전성이 원격 RLS에 의존하며 재현 가능한 전체 스키마가 아직 없음 | 중간 | 치명적 | 예 | Todo 2, 4 |
| TM-04 | 클라이언트의 관리자 메뉴는 이메일로 표시되지만 실제 관리자는 RPC로 판정되어 역할 모델이 불일치 | 낮음 | 중간 | 간접 | Todo 4 |
| TM-05 | 44개 `innerHTML` sink는 현재 상수 또는 이스케이프 경로지만, 문자열 템플릿·inline handler가 향후 저장형 XSS 회귀 지점을 만듦 | 중간 | 치명적 | 예 | Todo 7 |
| TM-06 | `avatar_url`·`bgm_url` 등 외부 URL이 리소스 `src`로 사용되어 추적·과도한 요청·허용 origin 이탈 가능 | 중간 | 높음 | 간접 | Todo 7 |
| TM-07 | Supabase CDN이 `@2` floating이고 외부 글꼴/SDK 무결성이 고정되지 않아 공급망 변경이 런타임에 유입 | 중간 | 높음 | 간접 | Todo 7 |
| TM-08 | 브라우저 세션이 XSS에 노출될 경우 publishable key가 아니라 사용자 access token이 탈취 대상이 됨 | 중간 | 치명적 | 예 | Todo 7, 9 |
| TM-09 | 글·댓글·반응·팔로우·신고·푸시에 서버 rate limit/dedupe가 불충분하면 비용·운영 큐 고갈 가능 | 높음 | 높음 | 예 | Todo 4, 6 |
| TM-10 | 푸시 broadcast/수신자/카테고리 검증이 약하면 운영자 사칭과 알림 폭탄 가능 | 중간 | 높음 | 예 | Todo 4, 10 |
| TM-11 | 차단 사용자의 콘텐츠·알림·검색 결과가 한 경로라도 필터를 우회하면 UGC 안전 기대를 위반 | 중간 | 높음 | 예 | Todo 4, 6 |
| TM-12 | 로그에 Authorization, 쿠키, FID, 이메일이 남으면 운영·증거 산출 과정에서 2차 유출 | 낮음 | 높음 | 간접 | Todo 1, 4, 10 |

## UGC 악용 사례

- HTML/스크립트, 이벤트 속성, `javascript:` 문자열을 게시글·댓글·프로필·알림에 저장한다.
- 제어문자, bidi 문자, 과도하게 긴 문자열로 필터·화면·로그를 교란한다.
- 금지 URL을 분할하거나 유사문자로 우회한다.
- 다중 계정으로 반응·팔로우·신고를 폭주시킨다.
- 차단 직전 생성한 알림이나 캐시된 피드로 차단을 우회한다.
- 닉네임·이메일·클라이언트 역할 플래그를 변조해 운영자로 보이게 한다.

현재 특성화 대상인 게시글·댓글·탐색 프로필·알림 상태 렌더러는 외부 문자열을 `textContent`/`innerText` 또는 `escapeHtml()` 경로로 보내야 한다. `dom-rendering.test.mjs`가 네 가지 악성/비정상 문자열 클래스로 이 계약을 고정한다.

## MASVS 제어군 매핑

| 제어군 | 현재 증거 | 남은 통제 |
| --- | --- | --- |
| MASVS-STORAGE | 명시적 localStorage namespace 목록 | 네이티브 세션의 플랫폼 보호 저장소, 민감 로그 제거 |
| MASVS-CRYPTO | TLS Supabase/Render/Firebase endpoint | 네이티브 서명 키·APNs 키 관리, 임의 암호 구현 금지 |
| MASVS-AUTH | Supabase 세션, OAuth, `auth.uid()` 지향 | PKCE/deep link 검증, Apple 로그인·삭제 시 credential revoke |
| MASVS-NETWORK | HTTPS endpoint, bearer 기반 Edge 호출 | origin allowlist, URL allowlist, timeout, 인증과 CORS 분리 |
| MASVS-PLATFORM | PWA 서비스 워커와 Notification 권한 | 최소 native permission, app links, safe area/lifecycle |
| MASVS-CODE | 44 sink 전수 목록, 실제 렌더 함수 특성화 | CSP, inline handler 제거, dependency pinning, secret scan |
| MASVS-RESILIENCE | 정적 웹에는 변조 방지 보장이 제한적 | 서명된 AAB/IPA, release variant와 패키지 allowlist |
| MASVS-PRIVACY | 설정·FID·검색기록 namespace 파악 | 보존·삭제·해외처리 고지, 데이터 최소화, 스토어 선언 일치 |

## 검증 소유권과 출시 판정

- Gate 0: 이 문서, DOM sink 전수 목록, 정적·렌더 특성화 테스트를 기준선으로 승인한다.
- Gate 1: Todo 2·4·5·6·7에서 위협별 서버/클라이언트 통제를 구현하고 공격 테스트를 연결한다.
- Gate 3 이후: Capacitor 패키지, native OAuth/푸시/저장소/권한 경계를 이 문서에 추가한다.
- `TM-01`, `TM-02`, `TM-03`, `TM-05`, `TM-09`, `TM-10`, `TM-11` 중 하나라도 미해결이면 스토어 후보를 만들지 않는다.

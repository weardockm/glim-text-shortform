# 글림(Glim)

글림은 짧은 한국어 문장에 감성 온도와 선택형 BGM을 더해, 세로형 피드에서 읽고 쓰고 반응하는 텍스트 숏폼 서비스다. 익명 열람은 열어두되 글·댓글·공감·저장·팔로우·차단·신고·알림은 인증된 계정과 서버 권한으로 보호한다.

현재 웹앱의 기본 사용자 경험은 완성되어 있다. 다음 목표는 기능을 넓히는 것이 아니라 보안 계약을 닫고, 같은 제품을 iOS와 Android 네이티브 앱으로 패키징해 대한민국 App Store와 Google Play에 1.0을 출시하는 것이다.

## 출시 목표

- 정식 웹 주소: [https://glimfactory.com](https://glimfactory.com)
- `www` 주소: `https://glimfactory.com`으로 리디렉션
- Apple Bundle ID / Android Package Name: `com.glimfactory.glim`
- 네이티브 런타임: Capacitor 8
- 1.0 배포 국가: 대한민국
- 가격 정책: 무료, 광고·구독·인앱결제 없음
- 데이터 계층: Supabase Auth, Database, Storage, Edge Functions
- 푸시: Firebase Cloud Messaging
- 웹 호스팅: Render Static Site

2026년 7월 4일 기준 `glimfactory.com`과 `www.glimfactory.com`은 Render에서 검증되었고 TLS 인증서가 발급되었다. 루트 도메인은 HTTPS `200`, `www`는 루트로 `301` 응답한다.

## 제품 경험

### 읽기와 발견

- 감성 문장을 한 화면씩 읽는 세로형 홈 피드
- 감성 온도, 공감, 최신성, 열람 이력을 반영한 추천
- 오늘의 공감 글, 감성별 탐색, 문장·사용자 검색
- 글에 연결된 BGM 재생과 미리듣기

### 쓰기와 관계

- 5~120자, 최대 12줄의 짧은 글
- 필수 감성 온도와 선택형 BGM
- 댓글, 공감, 저장, 팔로우
- 내 글·공감·저장 목록과 공개 사용자 프로필

### 안전과 운영

- 사용자·글·댓글 신고
- 사용자 차단과 차단 콘텐츠 필터
- 관리자 신고 검토, 콘텐츠 삭제, 7일 정지, 영구 정지
- 운영 공지와 카테고리별 알림 설정
- 앱 내 개인정보 처리방침, 이용약관, 회원 탈퇴

## 현재 구조

```text
.
├── index.html                  # 메인 PWA의 스타일, 화면, 시트, 법률 문서
├── index.js                    # 상태, 라우팅, 데이터, 렌더링, 제스처, 오디오, 푸시
├── admin.html / admin.js       # 신고 검토와 운영 공지
├── firebase-messaging-sw.js    # 웹 백그라운드 푸시와 알림 클릭
├── push-config.js              # 공개 Firebase/VAPID 설정
├── manifest.json               # PWA 메타데이터
├── image/                      # 로고와 기본 프로필 이미지
└── supabase/
    ├── migrations/             # RLS, RPC, 참여, 알림, 신고·제재 계약
    ├── functions/send-push/    # 인증된 FCM 발송
    ├── RLS_AUDIT.sql           # 읽기 전용 권한 감사
    └── config.toml             # Supabase 로컬 설정
```

웹 배포는 빌드리스 classic script 구조를 유지한다. 네이티브 배포만 별도의 허용 목록 패키징 단계에서 정적 런타임 파일을 `dist/`로 복사하고 Capacitor 프로젝트에 동기화한다.

## 출시 전 해결해야 할 핵심 위험

### 1. 저장소만으로 백엔드를 재현할 수 없음

현재 migration은 원격에 이미 존재하는 `posts`, `comments`, `profiles`, `follows`, `blocks`, `notifications` 등을 전제로 한다. `seed.sql`, 아바타 Storage 설정, 클라이언트가 호출하는 `delete-account` Edge Function도 저장소에 없다.

출시 전에는 빈 환경에서 전체 계약을 재현하고 두 번 연속 초기화·검증할 수 있어야 한다. 이미 적용된 migration은 수정하지 않고 후속 migration과 명시적 baseline으로 보완한다.

### 2. 운영자 권한 판정이 일관되지 않음

DB와 관리자 화면은 `user_roles` 및 `is_moderator()`를 사용하지만, 메인 UI와 공지 푸시 일부는 고정 이메일을 비교한다. 이메일은 표시·설정값일 뿐 권한 근거가 될 수 없다.

모든 운영 권한은 Auth UUID와 서버 역할 조회로 통일하고, 브라우저는 서버 결과를 표시하는 역할만 맡는다.

### 3. 계정 삭제가 실제로 완료되지 않음

회원 탈퇴 UI는 있지만 호출 대상 Edge Function이 없다. Apple은 앱 내 전체 계정 삭제를, Google은 앱 내 삭제와 공개 웹 삭제 요청 경로를 모두 요구한다.

`delete-account`는 최근 인증 확인, 종속 데이터·UGC·아바타·푸시 구독 삭제, Auth 사용자 삭제, 재시도 안전성, Sign in with Apple 토큰 폐기를 포함해야 한다. 공개 경로는 `https://glimfactory.com/account-delete`로 제공한다.

### 4. UGC 사전 필터와 동의 기록이 부족함

현재 신고·차단·제재는 있으나 게시 전 유해 콘텐츠 필터, 버전이 기록되는 약관·커뮤니티 가이드 동의, 운영 응답 시간 기록, 실제 고객지원 화면이 부족하다.

글과 댓글 쓰기는 서버 필터와 rate limit을 통과해야 한다. 신고·차단은 모든 공개 콘텐츠와 사용자에서 찾을 수 있어야 하며, 운영 처리 시간과 결과를 감사할 수 있어야 한다.

### 5. 브라우저 보안과 자동 검증이 부족함

대형 전역 스크립트, inline handler, 다수의 `innerHTML`, floating CDN 버전, 부재한 CSP·CI·브라우저 테스트가 변경 위험을 높인다.

현재 동작을 특성화 테스트로 고정한 뒤 DOM sink, 외부 URL, 의존성, 보안 헤더를 정리한다. DB 문자열은 `textContent` 또는 검증된 이스케이프 경로만 사용한다.

### 6. 웹 푸시와 네이티브 푸시는 같은 등록값이 아님

현재 웹은 Firebase Installation ID를 저장하고 FCM HTTP v1의 `fid` 대상으로 발송한다. 네이티브 iOS·Android 등록 방식과 수명주기는 다르다.

구독 테이블에 플랫폼과 endpoint 종류를 명시하고, 회전·해제·로그아웃·탈퇴·stale 정리를 설치 단위로 처리한다. APNs 토큰을 FCM FID로 오인하지 않는다.

## 구현 원칙

- 서버 검증이 클라이언트 상태보다 우선한다.
- 소유권·알림 수신자·운영 권한은 Auth UUID를 기준으로 한다.
- 이미 적용된 migration은 고치지 않고 더 늦은 migration으로 교체한다.
- 서비스 역할과 Apple/Firebase/스토어 서명 키는 브라우저·Git에 넣지 않는다.
- 보안 계약은 실패 테스트를 먼저 만들고 수정한다.
- 전역 함수·inline handler를 바꾸기 전 현재 동작을 특성화 테스트로 고정한다.
- 공개 웹 배포에는 번들러를 요구하지 않는다.
- 네이티브 앱에는 허용된 런타임 파일만 포함한다.
- 프로덕션 Capacitor 설정에 원격 `server.url`을 넣지 않는다.
- 관리자 화면과 백엔드/계획 파일은 소비자 앱에 패키징하지 않는다.
- 자동 테스트 성공만으로 출시를 선언하지 않는다. 실제 TestFlight·Play 배포본과 물리 기기 검증이 필요하다.

## 보안 및 스토어 출시 로드맵

### Gate 0. 재현 가능한 기반

1. Node 검사, 브라우저 테스트, 정적 보안 검사, secret scan, SBOM, CI를 추가한다.
2. 누락된 기본 스키마·Storage·seed·Edge Function 계약을 저장소에 보완한다.
3. 앱 시작부터 신고·탈퇴·푸시까지 현재 동작을 특성화하고 위협 모델을 작성한다.

완료 조건:

- 깨끗한 checkout에서 테스트와 로컬 DB 초기화가 성공한다.
- 클라이언트가 참조하는 모든 table, RPC, bucket, Edge Function이 존재한다.
- 사용자 입력 DOM sink와 권한 경계가 전부 분류된다.

### Gate 1. 서버 보안과 UGC 안전

1. RLS, grant, RPC, 역할, 카운터, 알림, Edge 인증을 최소 권한으로 통일한다.
2. 게시·댓글·반응·신고·팔로우·푸시에 서버 rate limit과 중복 방지를 적용한다.
3. `delete-account`와 공개 계정삭제 경로를 완성한다.
4. 버전형 약관 동의, 게시 전 필터, 신고·차단, 운영 SLA, 고객지원을 완성한다.
5. DOM sink, CSP, 외부 의존성, Render 보안 헤더를 강화한다.

완료 조건:

- 익명·다른 사용자·정지 계정·일반 사용자·운영자 공격 행렬이 기대대로 허용 또는 거부된다.
- 위조된 UUID, 이메일, 역할, 카운터, 알림 이벤트로 권한을 얻을 수 없다.
- 탈퇴 후 계정과 관련 데이터가 정책대로 삭제되고 재시도가 안전하다.
- 유해 콘텐츠 우회와 신고 폭주가 서버에서 차단된다.

### Gate 2. Capacitor 네이티브 앱

1. Capacitor 8 iOS·Android 프로젝트를 `com.glimfactory.glim`으로 생성한다.
2. 허용 목록 기반 네이티브 패키징 스크립트를 만든다.
3. iOS는 native Sign in with Apple, Google·Kakao는 안전한 외부 브라우저 OAuth와 PKCE를 사용한다.
4. `glimfactory.com`에 Apple AASA와 Android `assetlinks.json`을 배포한다.
5. 플랫폼별 Firebase 푸시 등록과 딥링크를 연결한다.
6. OS 공유, 햅틱, 네트워크·오프라인 상태, safe area, 백 버튼, 앱 수명주기 BGM, 아이콘·스플래시를 적용한다.

완료 조건:

- 네이티브 바이너리에 로컬 앱 자산만 포함되고 관리자·백엔드·비밀 파일이 없다.
- 웹·iOS·Android에서 OAuth, 푸시, 딥링크가 각각 실제 기기로 통과한다.
- 권한 거부, 오프라인, 프로세스 종료·재시작에서도 앱이 충돌하지 않는다.
- 앱이 단순 웹사이트 래퍼가 아니라 네이티브 통합 기능을 제공한다.

### Gate 3. 정책·메타데이터·품질

1. 실제 데이터 흐름을 기준으로 개인정보 처리방침, 이용약관, 커뮤니티 가이드, 지원, 삭제 문서를 갱신한다.
2. App Store Privacy Label과 `PrivacyInfo.xcprivacy`를 작성한다.
3. Google Play Data safety, UGC, 콘텐츠 등급, 계정삭제 선언을 작성한다.
4. 한국어 스토어 설명, 키워드, 릴리스 노트, 리뷰 계정·메모, 아이콘·스크린샷을 만든다.
5. 웹 접근성, 한국어 글자 확대, 성능, 오프라인, 보안 헤더 회귀를 통과시킨다.

완료 조건:

- 앱·정책·스토어 선언의 수집 데이터와 삭제 방식이 일치한다.
- 모든 공개 정책 URL이 로그인 없이 HTTPS `200`으로 열린다.
- 심각한 접근성·보안·충돌 문제가 없다.

### Gate 4. TestFlight와 Google Play 테스트

#### iOS

- Xcode 26 이상과 iOS 26 SDK로 archive한다.
- Associated Domains, Sign in with Apple, Push Notifications, Firebase/APNs, privacy manifest를 연결한다.
- 실제 iPhone에 TestFlight 빌드를 설치해 전체 회귀를 실행한다.

#### Android

- Google Play의 제출 시점 최신 요구 API를 사용한다. 현재 기준 최소 target API는 35다.
- 서명된 AAB를 만들고 Play App Signing을 사용한다.
- 내부 테스트 후 Play 배포본으로 App Links와 전체 회귀를 실행한다.
- Google 계정이 2023년 11월 13일 이후 생성된 개인 개발자 계정이면 최소 12명이 14일 연속 참여하는 비공개 테스트를 완료한다.
- 조직 계정이면 조직 검증 증빙을 기록하고 개인 계정 전용 테스트 요건만 건너뛴다.

완료 조건:

- 스토어가 생성한 실제 설치본에서 로그인·글·댓글·반응·신고·차단·푸시·딥링크·탈퇴가 통과한다.
- Apple validation과 Google pre-launch report에 차단 문제가 없다.

### Gate 5. 심사와 한국 출시

1. 같은 release candidate로 모든 정책 선언과 리뷰 메모를 다시 대조한다.
2. App Store와 Google Play에 제출하고 모든 반려 사유를 결함으로 처리한다.
3. 수정 후 영향 범위와 전체 핵심 회귀를 다시 실행한다.
4. 승인 후 대한민국에 수동·단계적으로 배포한다.
5. 충돌, OAuth, Edge 오류, 푸시 실패, 신고 처리, 탈퇴, 고객지원을 관찰한다.
6. 임계치를 넘으면 스토어 rollout 중지와 Render 이전 배포 복구를 실행한다.

완료 조건:

- iOS·Android 1.0이 대한민국 스토어에서 검색·설치 가능하다.
- 출시 관찰 기간에 중단 기준을 넘는 장애가 없다.
- 롤백과 운영 대응 절차가 검증되어 있다.

## 출시 검증 범위

필수 계정·기기:

- 익명 사용자
- 일반 계정 A와 B
- 정지·영구정지 테스트 계정
- 운영자 계정
- 실제 iPhone
- Android 15 이상 실제 기기
- TestFlight 배포본
- Google Play 내부 또는 비공개 테스트 배포본

필수 사용자 여정:

- 앱 시작, OAuth 로그인·취소·로그아웃·재로그인
- 홈·탐색·검색·문맥 피드
- 글·댓글·공감·저장·팔로우
- 프로필·아바타·차단
- 글·댓글·사용자 신고와 운영 처리
- 공지와 카테고리별 푸시
- 알림 클릭 딥링크
- 약관 동의 갱신
- 회원 탈퇴와 재시도
- 네트워크 단절, 권한 거부, 백그라운드·강제 종료·재실행

## 현재 사용할 검증 명령

```bash
node --check index.js
node --check admin.js
node --check firebase-messaging-sw.js
node --check push-config.js

npx supabase migration list --linked
npx supabase db lint --linked --level warning
npx supabase db push --linked --dry-run --yes
```

계획 실행 중에는 `npm run check`, `npm test`, Playwright, 로컬 Supabase reset, RLS 공격 행렬, SBOM·secret scan, Capacitor sync, Gradle AAB, Xcode archive 검증이 추가된다.

## 범위에서 제외

- 프론트엔드 프레임워크 전환
- 전체 TypeScript 변환
- 채팅·DM
- 광고·결제·구독
- 생성형 AI
- 네이티브 앱 안의 관리자 화면
- 원격 웹사이트를 로드하는 프로덕션 WebView
- 스토어 심사를 우회하는 OTA 코드 업데이트
- 대규모 리브랜딩

## 상세 실행계획

실행 순서, 파일별 참조, 수용 조건, 실패 시나리오, 증거 경로와 커밋 단위는 [`.omo/plans/glim-production-roadmap.md`](.omo/plans/glim-production-roadmap.md)에 정의되어 있다.

이 문서는 계획 문서다. 실제 구현은 승인된 계획을 `$omo:start-work`로 실행할 때 시작한다.

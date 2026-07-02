# 글림 푸시 알림 연결하기

현재 코드에는 푸시 알림의 화면, 기기 등록, 카테고리 설정, 발송 함수까지
연결되어 있습니다. 아래 순서대로 Firebase 값과 Supabase 서버 설정을 적용하면
실제 기기에서 작동합니다.

## 1. Firebase 프로젝트와 웹 앱 만들기

1. [Firebase Console](https://console.firebase.google.com/)에 접속합니다.
2. 프로젝트를 새로 만들거나 기존 프로젝트를 선택합니다.
3. 프로젝트 개요에서 `웹(</>)` 아이콘을 누릅니다.
4. 앱 이름에 `glim-web`처럼 알아보기 쉬운 이름을 입력하고 등록합니다.
5. 화면에 표시되는 `firebaseConfig` 값을 복사합니다.
6. 프로젝트의 `push-config.js`를 열고 다음 항목에 각각 붙여 넣습니다.

```js
globalThis.GLIM_PUSH_CONFIG = Object.freeze({
  firebase: Object.freeze({
    apiKey: "Firebase에서 복사한 값",
    authDomain: "Firebase에서 복사한 값",
    projectId: "Firebase에서 복사한 값",
    storageBucket: "Firebase에서 복사한 값",
    messagingSenderId: "Firebase에서 복사한 값",
    appId: "Firebase에서 복사한 값",
  }),
  vapidKey: "2단계에서 복사할 공개키",
});
```

`firebaseConfig`와 `vapidKey`는 웹 브라우저에 공개되는 값이라 이 파일에
넣어도 됩니다. 서비스 계정 JSON은 절대로 이 파일에 넣으면 안 됩니다.

## 2. Web Push 공개키 만들기

1. Firebase Console 왼쪽 위 톱니바퀴를 눌러 `프로젝트 설정`으로 이동합니다.
2. `Cloud Messaging` 탭을 엽니다.
3. `웹 구성 > Web Push 인증서`에서 `키 페어 생성`을 누릅니다.
4. 만들어진 공개키를 복사합니다.
5. `push-config.js`의 `vapidKey`에 붙여 넣습니다.

새 Firebase 프로젝트는 필요한 등록 API가 보통 자동 활성화됩니다. 기기 등록
중 API 비활성화 오류가 뜨는 경우 같은 Firebase 프로젝트의 Google Cloud
Console에서 `FCM Registration API`를 활성화합니다.

## 3. Supabase 테이블 만들기

가장 쉬운 방법은 Supabase Dashboard의 `SQL Editor`를 사용하는 것입니다.

1. 글림 Supabase 프로젝트를 엽니다.
2. `SQL Editor > New query`를 누릅니다.
3. `supabase/migrations/20260702020000_push_notifications.sql`의 전체 내용을
   복사해 붙여 넣습니다.
4. `Run`을 누릅니다.
5. Table Editor에 `push_subscriptions`가 생겼는지 확인합니다.

Supabase CLI를 사용 중이라면 아래 방식도 가능합니다.

```powershell
npx supabase link --project-ref qdnpeliqtxdglqewbvgg
npx supabase db push
```

## 4. Firebase 서비스 계정 비공개키를 Supabase에 보관하기

1. Firebase Console의 `프로젝트 설정 > 서비스 계정`을 엽니다.
2. `새 비공개 키 생성`을 눌러 JSON 파일을 받습니다.
3. Supabase Dashboard에서 글림 프로젝트의 `Edge Functions > Secrets`를
   엽니다.
4. 이름을 `FIREBASE_SERVICE_ACCOUNT_JSON`으로 입력합니다.
5. 값에는 다운로드한 JSON 파일의 전체 내용을 붙여 넣고 저장합니다.

이 JSON은 푸시를 발송할 수 있는 비공개키입니다. 프로젝트 폴더, Git,
`push-config.js`, `index.js`에 저장하면 안 됩니다. 실수로 Git에 올렸다면
Firebase에서 해당 키를 즉시 삭제하고 새로 발급해야 합니다.

## 5. Supabase 발송 함수 배포하기

프로젝트 루트의 PowerShell에서 실행합니다.

```powershell
npx supabase functions deploy send-push --project-ref qdnpeliqtxdglqewbvgg
```

배포 후 Supabase Dashboard의 `Edge Functions` 목록에 `send-push`가 보이면
서버 연결이 끝난 것입니다.

## 6. HTTPS 주소에서 테스트하기

푸시 알림은 일반 IP 주소의 HTTP 페이지에서는 작동하지 않습니다. 배포된
HTTPS 주소 또는 개발 PC의 `localhost`에서 테스트합니다.

1. 서로 다른 글림 계정 A와 B를 준비합니다.
2. B 계정으로 `설정 > 알림 설정`을 엽니다.
3. `이 기기 푸시 알림`을 켜고 브라우저 권한 창에서 `허용`을 누릅니다.
4. Supabase의 `push_subscriptions`에 B 계정 행이 생겼는지 확인합니다.
5. A 계정으로 B의 글에 좋아요나 댓글을 남기거나 B를 팔로우합니다.
6. B 기기에서 글림을 닫은 상태로 푸시가 도착하는지 확인합니다.
7. 관리자 화면에서 공지를 등록해 공지 푸시도 확인합니다.

아이폰/iPad는 Safari에서 글림을 연 뒤 `공유 > 홈 화면에 추가`로 설치해야
푸시 알림을 켤 수 있습니다. 설치한 글림 앱 안에서 알림 스위치를 켜야 합니다.

## 연결된 파일

- `push-config.js`: Firebase 웹 공개 설정
- `firebase-messaging-sw.js`: 앱이 닫혔을 때 알림 표시
- `index.js`: 권한 요청, 기기 등록, 좋아요·댓글·팔로우 발송 요청
- `admin.js`: 공지 등록 시 전체 푸시 발송
- `supabase/migrations/20260702020000_push_notifications.sql`: 기기 정보 테이블
- `supabase/functions/send-push/index.ts`: FCM 서버 발송 함수

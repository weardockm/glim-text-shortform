# 글림 네이티브 OAuth/App Links 설정

이 문서는 `com.glimfactory.glim` 네이티브 앱이 `glim://auth/callback`으로 직접 돌아오는 Supabase OAuth 콜백과 웹용 `https://glimfactory.com/auth/callback`을 안전하게 운영하기 위한 절차입니다.

## 필요한 값

- Apple Team ID: Apple Developer 계정의 10자리 Team ID
- Android SHA-256 인증서 지문: Google Play Console의 App signing certificate SHA-256 지문

Android 디버그 빌드를 직접 검증하려면 debug keystore SHA-256도 추가할 수 있습니다. 프로덕션 검증에는 Play App Signing 인증서 지문이 필요합니다.

## 파일 생성

값을 준비한 뒤 아래 명령을 실행합니다.

```bash
GLIM_APPLE_TEAM_ID=ABCDE12345 \
GLIM_ANDROID_SHA256_CERT_FINGERPRINTS=AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99 \
npm run native:associations
```

여러 Android 지문은 쉼표로 구분합니다.

```bash
GLIM_ANDROID_SHA256_CERT_FINGERPRINTS=PLAY_SHA256,DEBUG_SHA256 npm run native:associations
```

생성되는 공개 파일:

- `.well-known/apple-app-site-association`
- `.well-known/assetlinks.json`

이 파일들은 비밀이 아니지만, 실제 계정 식별자와 인증서 지문이므로 콘솔 값과 정확히 일치해야 합니다.

## Supabase Redirect URL

Supabase Auth Redirect URLs에 아래 URL이 있어야 합니다.

```text
glim://auth/callback
https://glimfactory.com/auth/callback
```

## 네이티브 프로젝트 계약

- Android: `android/app/src/main/AndroidManifest.xml`에 `glim://auth/callback` intent-filter와 `android:autoVerify="true"` App Link intent-filter가 있어야 합니다.
- iOS: `ios/App/App/Info.plist`에 `glim` URL scheme이, `ios/App/App/App.entitlements`에 `applinks:glimfactory.com` Associated Domain이 있어야 합니다.
- Capacitor runtime은 production `server.url`을 쓰지 않고 `dist/` local assets를 사용해야 합니다.

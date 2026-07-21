# Native auth and verified links

Glim native auth opens the Supabase authorization URL directly and returns through the app URL scheme. Web auth and verified-link fallback continue to use the HTTPS callback. Add both URLs to the Supabase Auth redirect allowlist. OAuth provider consoles still use the Supabase provider callback URL.

- Native callback: glim://auth/callback
- Web and verified-link callback: https://glimfactory.com/auth/callback
- Android package: com.glimfactory.glim
- iOS bundle ID: com.glimfactory.glim

## Android App Links

AndroidManifest.xml declares an auto-verified App Link for https://glimfactory.com/auth/callback. Final domain verification still needs a published /.well-known/assetlinks.json using the Play App Signing certificate SHA-256 fingerprint. Do not guess this value before Play App Signing is active.

## iOS Universal Links

iOS needs the Associated Domains capability with applinks:glimfactory.com and a published /.well-known/apple-app-site-association file. Final values require the Apple Team ID from the enrolled developer account.

## Supabase redirect allowlist

Required production URLs:

```text
glim://auth/callback
https://glimfactory.com/auth/callback
```

Keep local development URLs separate from production.

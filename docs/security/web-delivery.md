# Web Delivery Security Contract

## Render headers

`render.yaml` is the source of truth for the production response headers. The
root and `www` host are already HTTPS-only, so HSTS is enabled for one year with
subdomains. The policy also denies framing, MIME sniffing, camera, microphone,
geolocation, payment, and USB access.

The CSP intentionally does not allow inline JavaScript or `eval`. All former
HTML event attributes are inert `data-*` declarations handled through an exact
allowlist in `index.js` or `admin.js`.

## One accepted CSP exception

`style-src` currently contains `'unsafe-inline'`. This is required by the
buildless architecture because both documents contain their established CSS in
an inline `<style>` block and some existing renderers assign narrow,
presentation-only `style` values. Removing the exception requires extracting
and hashing the complete legacy style surface, which is a separate visual
refactor and is not safe to mix into launch hardening.

This exception applies only to styles. `script-src` must never gain
`'unsafe-inline'` or `'unsafe-eval'`.

## Allowed network boundaries

- Application scripts: same origin, exact-version Supabase from jsDelivr, and
  exact-version Firebase compat scripts from `www.gstatic.com`.
- Data: the Glim Supabase HTTPS and realtime origins plus Firebase installation,
  registration, and Google messaging endpoints.
- Fonts: Google Fonts stylesheet and font origins. Failure falls back to the
  design-system serif/sans stacks.
- Images and audio: same origin, safe `data:`/`blob:` use where already required,
  and the single Glim Supabase project origin.
- Notification click navigation: same-origin URLs only.
- BGM playback: same-origin URLs or the public `/bgm/` path on the Glim Supabase
  Storage origin.

## Deployment verification

This task updates the blueprint but does not deploy it. After Render deploys:

1. Run `curl -I https://glimfactory.com` and confirm every configured header.
2. Run `curl -I https://www.glimfactory.com` and confirm the canonical redirect.
3. Re-run the browser security QA against the deployed origin.
4. Confirm OAuth, Firebase push, Google Fonts, BGM, and Supabase realtime
   connections produce no unexpected CSP violations.

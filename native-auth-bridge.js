(() => {
  const NATIVE_AUTH_MARKER = "glim_native_oauth_browser";
  const NATIVE_AUTH_MAX_AGE_MS = 10 * 60 * 1000;
  const currentUrl = new URL(window.location.href);
  const isGlimPage = currentUrl.origin === "https://glimfactory.com";
  const isNativeStart =
    isGlimPage && currentUrl.pathname === "/auth/native-start";
  const isAuthCallback =
    isGlimPage && currentUrl.pathname === "/auth/callback";

  if (isGlimPage && !isNativeStart && !isAuthCallback) {
    window.sessionStorage.removeItem(NATIVE_AUTH_MARKER);
    return;
  }

  if (isNativeStart) {
    try {
      const oauthUrl = new URL(currentUrl.searchParams.get("oauth") || "");
      const isTrustedOAuthUrl =
        oauthUrl.origin === "https://qdnpeliqtxdglqewbvgg.supabase.co" &&
        oauthUrl.pathname === "/auth/v1/authorize";
      if (!isTrustedOAuthUrl) return;

      window.sessionStorage.setItem(NATIVE_AUTH_MARKER, String(Date.now()));
      window.location.replace(oauthUrl.href);
    } catch (_error) {
      return;
    }
    return;
  }

  if (!isAuthCallback) return;

  const markerValue = window.sessionStorage.getItem(NATIVE_AUTH_MARKER);
  window.sessionStorage.removeItem(NATIVE_AUTH_MARKER);
  const markerAge = Date.now() - Number.parseInt(markerValue || "", 10);
  const isCurrentNativeAttempt =
    Number.isFinite(markerAge) &&
    markerAge >= 0 &&
    markerAge <= NATIVE_AUTH_MAX_AGE_MS;
  if (!isCurrentNativeAttempt) return;

  const code = currentUrl.searchParams.get("code")?.trim();
  if (!code) return;
  const nativeUrl = new URL("glim://auth/callback");
  nativeUrl.searchParams.set("code", code);
  window.location.replace(nativeUrl.href);
})();

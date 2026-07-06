(() => {
  const key = "glim_theme_preference";
  let preference = "system";
  try {
    const stored = localStorage.getItem(key);
    if (["dark", "light", "system"].includes(stored)) preference = stored;
  } catch (_error) {}

  const resolved =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document
    .getElementById("themeColorMeta")
    ?.setAttribute("content", resolved === "dark" ? "#050505" : "#f6f2ee");
})();

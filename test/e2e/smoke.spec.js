import { expect, test } from "@playwright/test";
import { supabaseBrowserStub } from "../security/fixtures/supabase-browser-stub.mjs";

test("serves the Korean application shell and runtime assets", async ({
  page,
  request,
}) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:4173)/, (route) =>
    route.abort(),
  );

  const response = await page.goto("/", {
    timeout: 10_000,
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("글림 - 텍스트 숏폼");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.locator("#view-home")).toHaveClass(/active/);

  const manifest = await request.get("/manifest.json");
  expect(manifest.status()).toBe(200);
  expect(manifest.headers()["content-type"]).toContain("application/json");

  const logo = await request.get("/image/app-logo.png");
  expect(logo.status()).toBe(200);
  expect(logo.headers()["content-type"]).toBe("image/png");
});

test("updates the write counter for English letters and numbers", async ({
  page,
}) => {
  await page.addInitScript(supabaseBrowserStub);
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (!url.startsWith("http://127.0.0.1:4173/")) {
      route.abort();
      return;
    }
    route.continue();
  });

  await page.goto("/", {
    timeout: 10_000,
    waitUntil: "domcontentloaded",
  });
  await page.evaluate(() => {
    document
      .querySelectorAll(".app-view")
      .forEach((view) => view.classList.remove("active"));
    document.getElementById("view-write").classList.add("active");
  });

  await page.locator("#postContent").click();
  await page.keyboard.type("abc123");
  await expect(page.locator("#charCount")).toContainText("6 / 120");
});


test("requires policy agreement before social login and stores it after auth", async ({
  page,
}) => {
  await page.addInitScript(supabaseBrowserStub);
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (!url.startsWith("http://127.0.0.1:4173/")) {
      route.abort();
      return;
    }
    route.continue();
  });

  await page.goto("/", {
    timeout: 10_000,
    waitUntil: "domcontentloaded",
  });
  await page.evaluate(() => activateAppView("view-profile"));

  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("커뮤니티 기준");
    await dialog.accept();
  });
  await page.getByText("Google로 계속하기").click();
  await expect
    .poll(() => page.evaluate(() => window.__oauthProvider))
    .toBe("google");

  await page.evaluate(() =>
    window.__emitAuth({
      user: {
        id: "new-user-fixture",
        email: "new@example.test",
        user_metadata: { random_nickname: "새 글리머" },
      },
    }),
  );

  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__supabaseCalls.some(
          (call) => call.boundary === "rpc" && call.name === "accept_current_ugc_policy",
        ),
      ),
    )
    .toBe(true);
});

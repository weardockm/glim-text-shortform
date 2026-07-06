import { expect, test } from "@playwright/test";

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

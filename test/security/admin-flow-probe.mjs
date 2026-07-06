import assert from "node:assert/strict";

export async function assertAdminJourneys(context, origin) {
  const unauthorized = await context.newPage();
  const deniedDialogs = [];
  unauthorized.on("dialog", async (dialog) => {
    deniedDialogs.push(dialog.message());
    await dialog.accept();
  });
  await unauthorized.goto(`${origin}/admin.html`, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  await unauthorized.waitForURL(/\/index\.html$/, { timeout: 10_000 });
  assert.deepEqual(deniedDialogs, ["접근 권한이 없습니다. (관리자 전용 구역)"]);
  await unauthorized.close();

  const authorized = await context.newPage();
  const authorizedDialogs = [];
  authorized.on("dialog", async (dialog) => {
    authorizedDialogs.push(dialog.message());
    await dialog.accept();
  });
  await authorized.goto(`${origin}/admin.html?adminFixture=1`, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  await authorized.locator(".report-review-card").waitFor({ timeout: 10_000 });
  const reportState = await authorized.evaluate(() => {
    const container = document.querySelector("#adminReportList");
    return {
      text: container.textContent,
      rawElements: container.querySelectorAll("script, img, [onerror]").length,
      roleCalls: window.__supabaseCalls
        .filter(({ boundary }) => boundary === "rpc")
        .map(({ name }) => name),
    };
  });
  assert.ok(reportState.text.includes("<img src=x onerror=window.__xss=1>"));
  assert.ok(reportState.text.includes("<script>window.__xss=1</script>"));
  assert.ok(reportState.text.includes("검토 SLA"));
  assert.ok(reportState.text.includes("이의제기 요청됨"));
  assert.ok(reportState.text.includes("격리/보존"));
  assert.equal(reportState.rawElements, 0);
  assert.ok(reportState.roleCalls.includes("is_moderator"));

  await authorized.getByRole("button", { name: "격리" }).click();
  await authorized.waitForFunction(() =>
    window.__supabaseCalls.some(
      ({ boundary, name, detail }) =>
        boundary === "rpc" &&
        name === "moderate_report" &&
        detail?.moderation_action === "quarantine_content",
    ),
  );
  await authorized.getByRole("button", { name: "기각" }).click();
  await authorized.waitForFunction(() =>
    window.__supabaseCalls.some(
      ({ boundary, name, detail }) =>
        boundary === "rpc" &&
        name === "moderate_report" &&
        detail?.moderation_action === "dismiss",
    ),
  );
  assert.ok(
    authorizedDialogs.some((message) => message.includes("기각")),
    "moderation confirmation/completion dialog was not observed",
  );
  await authorized.close();
  return {
    denied: true,
    moderatorRoleChecked: true,
    hostileReportRenderedAsText: true,
    moderationMetadataVisible: true,
    quarantineActionCalled: true,
    moderationRpcCalled: true,
  };
}

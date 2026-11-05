import { expect, test, type BrowserContext } from "@playwright/test";

/* "Download the Android app" on the public pages, against a mocked app_versions read. */

const APK = "https://example.test/bahaba.apk";

async function mockVersions(context: BrowserContext, row: Record<string, unknown> | null) {
  const requests: string[] = [];
  await context.route(/\/rest\/v1\/app_versions/, (route) => {
    requests.push(decodeURIComponent(route.request().url()));
    return route.fulfill({ json: row ? [row] : [] });
  });
  return requests;
}

test("Welcome and Login link to the latest published APK", async ({ page, context }) => {
  const requests = await mockVersions(context, { apk_url: APK });
  await page.goto("/");

  const links = page.getByRole("link", { name: "Download the Android app" });
  await expect(links).toHaveCount(2); // button + footer
  await expect(links.first()).toHaveAttribute("href", APK);
  await expect(links.last()).toHaveAttribute("href", APK);

  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Download the Android app" })).toHaveAttribute("href", APK);

  expect(requests[0]).toContain("is_published=eq.true");
  expect(requests[0]).toContain("platform=eq.android");
  expect(requests[0]).toContain("order=version_code.desc");
  expect(requests[0]).toContain("limit=1");
});

for (const [name, row] of [
  ["no published release", null],
  ["a release without a link", { apk_url: null }],
  ["a link that is not https", { apk_url: "javascript:alert(1)" }],
] as const) {
  test(`hidden with ${name}`, async ({ page, context }) => {
    const requests = await mockVersions(context, row);
    await page.goto("/");
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: "BAHAba", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Download the Android app" })).toHaveCount(0);
  });
}

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/* Admin dashboard tab order and opening page, against a mocked Supabase. */

test.describe.configure({ timeout: 90_000 });

const ID = "00000000-0000-4000-8000-000000000021";
const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const session = (email: string) => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: ID, email, role: "authenticated", aud: "authenticated", exp })}.sig`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: "refresh",
    user: { id: ID, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
};

const report = { id: 9, user_name: "r", location: "Road", lat: null, lng: null, water_level: "knee", description: "d", status: "pending", timestamp: new Date().toISOString(), photo_path: null, admin_reply: null, admin_reply_at: null, rejection_reason: null, approval_reason: null, user_id: null, barangay: "Poctoy" };

async function mock(context: BrowserContext, role: "mdrrmo" | "barangay") {
  const email = `${role}@test.local`;
  await context.route(/supabase\.co/, (route) => route.abort());
  await context.route(/\/auth\/v1\/token/, (route) => route.fulfill({ json: session(email) }));
  await context.route(/\/auth\/v1\/user/, (route) => route.fulfill({ json: session(email).user }));
  await context.route(/\/rest\/v1\//, (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split("/rest/v1/")[1];
    const one = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const headers = { "content-range": "0-0/1", "access-control-expose-headers": "Content-Range" };
    if (req.method() === "HEAD") return route.fulfill({ status: 200, headers, body: "" });
    if (table === "profiles" && !url.searchParams.get("select")?.startsWith("id")) {
      const row = { id: ID, role, name: "T", email, phone: "09170000000", barangay: "Poctoy" };
      return route.fulfill({ json: one ? row : [row] });
    }
    if (table === "community_reports") return route.fulfill({ json: [report], headers });
    return route.fulfill({ json: one ? null : [], headers });
  });
  return email;
}

async function signIn(page: Page, email: string, path: string) {
  await page.goto("/login");
  await page.getByPlaceholder("your.email@example.com").fill(email);
  await page.getByPlaceholder("Enter your password").fill("password123");
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL(`**${path}`);
}

const MDRRMO_TABS = ["Create Alert", "Verify Reports", "Quick Reports", "Flood Events", "Overview", "Audit Trail", "Field Observations"];

for (const [name, viewport] of [["desktop", { width: 1360, height: 900 }], ["mobile", { width: 390, height: 844 }]] as const) {
  test(`MDRRMO tabs are in order and Create Alert opens first (${name})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport });
    const email = await mock(context, "mdrrmo");
    const page = await context.newPage();
    await signIn(page, email, "/admin/mdrrmo");

    const tablist = page.getByRole("tablist").first();
    await expect(tablist.getByRole("tab", { name: /Verify Reports/ })).toContainText("1");
    const labels = (await tablist.getByRole("tab").allInnerTexts()).map((t) => t.replace(/\s*\d+\s*(pending)?\s*$/, "").trim());
    expect(labels).toEqual(MDRRMO_TABS);
    await expect(tablist.getByRole("tab", { name: "Create Alert" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("button", { name: "Dismiss", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Dismiss", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Create Alert", exact: true })).toBeVisible();
    await context.close();
  });
}

test("every MDRRMO tab still opens its page", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const email = await mock(context, "mdrrmo");
  const page = await context.newPage();
  await signIn(page, email, "/admin/mdrrmo");
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();

  for (const [tab, heading] of [
    [/Verify Reports/, "Community Reports Management"],
    [/Flood Events/, "Flood Events"],
    [/Overview/, "System Overview"],
    [/Audit Trail/, "System Audit Trail & Message Traceability"],
  ] as const) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
  await context.close();
});

test("barangay menu is Create Alert, Reports, Field Observations, Overview; Reports has three tabs", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const email = await mock(context, "barangay");
  const page = await context.newPage();
  await signIn(page, email, "/admin/barangay");

  const tablist = page.getByRole("tablist", { name: "Dashboard sections" });
  const labels = (await tablist.getByRole("tab").allInnerTexts()).map((t) => t.replace(/\s*\(.*\)\s*$/, "").trim());
  expect(labels).toEqual(["Create Alert", "Reports", "Field Observations", "Overview"]);
  await expect(page.getByRole("tablist", { name: "Report type" }).getByRole("tab")).toHaveText(["All reports", "Community reports", "Quick reports"]);

  await tablist.getByRole("tab", { name: /Create Alert/ }).click();
  await expect(page.getByRole("heading", { name: "Create Alert", exact: true })).toBeVisible();
  await context.close();
});

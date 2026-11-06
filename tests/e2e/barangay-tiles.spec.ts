import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { countActiveAlerts, countPublishedToday, shortAgo } from "../../src/lib/barangayTiles";

/* Barangay home tiles against a mocked Supabase (no real accounts or data). */

const id = "00000000-0000-4000-8000-000000000002";
const email = "barangay@test.local";
const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 3600;
const user = { id, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = {
  access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: id, email, role: "authenticated", aud: "authenticated", exp })}.sig`,
  token_type: "bearer",
  expires_in: 3600,
  expires_at: exp,
  refresh_token: "refresh-barangay",
  user,
};

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const report = (n: number, status: string) => ({ id: n, status, barangay: "Poctoy", location: `Bridge ${n}`, water_level: "knee", user_name: "Ana", timestamp: ago(n) });
const alert = (n: number, source: string, status: string, sent: string) => ({
  id: n, level: "advisory", title: `Alert ${n}`, message: "Stay safe", target_barangay: "Poctoy", channels: "App", sent_at: sent, recipients: 1, created_by: "x", status, source,
});

type Tables = Record<string, unknown[] | "fail">;

async function mock(context: BrowserContext, tables: Tables) {
  await context.route(/\/auth\/v1\/token/, (route) => route.fulfill({ json: session }));
  await context.route(/\/auth\/v1\/user/, (route) => route.fulfill({ json: user }));
  await context.route(/\/rest\/v1\//, (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split("/rest/v1/")[1];
    if (route.request().method() === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": "0-0/0" }, body: "" });
    const single = route.request().headers()["accept"]?.includes("vnd.pgrst.object");
    if (table === "profiles") {
      const row = { id, role: "barangay", name: "Test official", email, phone: "09170000000", barangay: "Poctoy" };
      return route.fulfill({ json: single ? row : [row] });
    }
    const rows = tables[table];
    if (rows === "fail") return route.fulfill({ status: 500, json: { message: "boom" } });
    return route.fulfill({ json: single ? rows?.[0] ?? null : rows ?? [] });
  });
  await context.route(/\/realtime\/v1\//, (route) => route.abort());
}

const shortcuts = (page: Page) => page.getByRole("navigation", { name: "Shortcuts" });
const tiles = (page: Page) => shortcuts(page).getByRole("button");
const tile = (page: Page, name: string) => shortcuts(page).getByRole("button", { name: new RegExp(`^${name}`) });

async function open(page: Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("your.email@example.com").fill(email);
  await page.getByPlaceholder("Enter your password").fill("password123");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/admin\/barangay$/);
  await expect(tiles(page).first()).toBeVisible();
}

const full = (): Tables => ({
  active_alerts: [
    { expires_at: null, is_all_clear: false },
    { expires_at: ago(-60), is_all_clear: false },
    { expires_at: null, is_all_clear: true },
    { expires_at: ago(5), is_all_clear: false },
  ],
  community_reports: [report(1, "pending"), report(2, "pending"), report(3, "approved")],
  quick_reports: [{ id: 9, status: "pending", barangay: "Poctoy", created_at: ago(1) }],
  field_observations: [{ id: 1, barangay: "Poctoy", kind: "waterway", location: "Creek", status: "normal", note: null, observed_at: ago(20) }],
  alerts: [alert(1, "barangay", "approved", ago(1)), alert(2, "mdrrmo", "approved", ago(1)), alert(3, "barangay", "approved", ago(60 * 24 * 3))],
  barangays: [{ id: 1, name: "Poctoy", flood_risk: "high" }],
});

test.describe("tile rules", () => {
  test("active: leaves out all clears and passed end times", () => {
    const rows = [
      { expires_at: null, is_all_clear: false },
      { expires_at: null, is_all_clear: true },
      { expires_at: "2020-01-01T00:00:00Z", is_all_clear: false },
    ];
    expect(countActiveAlerts(rows, Date.now())).toBe(1);
  });

  test("published today uses the Manila calendar", () => {
    const now = Date.parse("2026-11-06T16:30:00Z"); // 00:30 on Nov 7 in Manila
    const rows = [
      { status: "approved", sent_at: "2026-11-06T16:10:00Z" },
      { status: "withdrawn", sent_at: "2026-11-06T16:20:00Z" },
      { status: "approved", sent_at: "2026-11-06T15:50:00Z" }, // still Nov 6 in Manila
      { status: "rejected", sent_at: "2026-11-06T16:20:00Z" },
    ];
    expect(countPublishedToday(rows, now)).toBe(2);
  });

  test("short times", () => {
    const now = Date.now();
    expect(shortAgo(now - 20_000, now)).toBe("just now");
    expect(shortAgo(now - 20 * 60_000, now)).toBe("20 min ago");
    expect(shortAgo(now - 3 * 3_600_000, now)).toBe("3 hr ago");
    expect(shortAgo(now - 86_400_000, now)).toBe("1 day ago");
  });
});

test.describe("barangay home tiles", () => {
  test("shows the six tiles in order with their live lines", async ({ page, context }) => {
    await mock(context, full());
    await open(page);
    await expect(tiles(page)).toHaveCount(6);
    await expect(tile(page, "Create Alert")).toContainText("Publish an alert for Poctoy · 2 active now");
    await expect(tile(page, "Reports")).toContainText("2 waiting for the MDRRMO");
    await expect(tile(page, "Field Observations")).toContainText("Last update 20 min ago");
    await expect(tile(page, "My Alerts")).toContainText("1 published today");
    await expect(tile(page, "Overview")).toContainText("High risk");
    await expect(tile(page, "Settings")).toContainText("Account and notifications");
    const labels = await shortcuts(page).locator("button > span.text-sm").allInnerTexts();
    expect(labels).toEqual(["Create Alert", "Reports", "Field Observations", "My Alerts", "Overview", "Settings"]);
    // The menu is unchanged.
    await expect(page.getByRole("tablist", { name: "Dashboard sections" }).getByRole("tab")).toHaveCount(4);
  });

  test("each tile opens its section", async ({ page, context }) => {
    await mock(context, full());
    await open(page);
    const selected = page.getByRole("tablist", { name: "Dashboard sections" }).getByRole("tab", { selected: true });

    await tile(page, "Create Alert").click();
    await expect(selected).toContainText("Create Alert");
    await expect(page.locator("#barangay-sections")).toBeFocused();

    await tile(page, "Field Observations").click();
    await expect(selected).toContainText("Field Observations");

    await tile(page, "Overview").click();
    await expect(selected).toContainText("Overview");
    await expect(page.getByRole("heading", { name: "Overview of Poctoy" })).toBeVisible();

    await tile(page, "My Alerts").click();
    await expect(selected).toContainText("Create Alert");
    await expect(page.locator("#my-published-title")).toBeInViewport();

    await tile(page, "Reports").click();
    await expect(selected).toContainText("Reports");
    const sections = page.locator("#barangay-sections");
    await expect(sections.getByText("Bridge 1")).toBeVisible();
    await expect(sections.getByText("Bridge 3")).toHaveCount(0); // approved: filtered out

    await tile(page, "Settings").click();
    await expect(page).toHaveURL(/\/admin\/barangay\/settings$/);
  });

  test("a failed number shows a dash and the tile still opens", async ({ page, context }) => {
    await mock(context, { ...full(), active_alerts: "fail", field_observations: "fail", community_reports: "fail", barangays: "fail" });
    await open(page);
    await expect(tile(page, "Create Alert")).toContainText("Publish an alert for Poctoy · —");
    await expect(tile(page, "Reports")).toContainText("—");
    await expect(tile(page, "Field Observations")).toContainText("—");
    await expect(tile(page, "Overview")).toContainText("—");
    await expect(tile(page, "My Alerts")).toContainText("1 published today");
    await tile(page, "Overview").click();
    await expect(page.getByRole("tablist", { name: "Dashboard sections" }).getByRole("tab", { selected: true })).toContainText("Overview");
  });

  test("shows a skeleton until a number arrives", async ({ page, context }) => {
    await mock(context, full());
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await context.route(/\/rest\/v1\/active_alerts/, async (route) => {
      await held;
      return route.fulfill({ json: [] });
    });
    await open(page);
    await expect(tile(page, "Create Alert").locator(".animate-pulse")).toHaveCount(1);
    await expect(tile(page, "Reports")).toContainText("2 waiting");
    release();
    await expect(tile(page, "Create Alert")).toContainText("0 active now");
  });

  test("refreshes when the tab regains focus", async ({ page, context }) => {
    const tables = full();
    await mock(context, tables);
    await open(page);
    await expect(tile(page, "Reports")).toContainText("2 waiting");
    await expect(tile(page, "Create Alert")).toContainText("2 active now");
    tables.community_reports = [report(1, "pending")];
    tables.active_alerts = [];
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(tile(page, "Reports")).toContainText("1 waiting");
    await expect(tile(page, "Create Alert")).toContainText("0 active now");
  });

  test("2 columns on a phone, 3 on desktop, equal tiles, big targets, focus outline", async ({ page, context }) => {
    await mock(context, full());
    await page.setViewportSize({ width: 360, height: 740 });
    await open(page);
    await expect(tile(page, "Overview")).toContainText("High risk");
    const boxes = async () => Promise.all((await tiles(page).all()).map(async (t) => (await t.boundingBox())!));
    const distinct = (values: number[]) => new Set(values.map(Math.round)).size;

    const phone = await boxes();
    expect(distinct(phone.map((b) => b.x))).toBe(2);
    expect(distinct(phone.map((b) => b.height))).toBe(1);
    expect(distinct(phone.map((b) => b.width))).toBe(1);
    expect(Math.min(...phone.map((b) => b.height))).toBeGreaterThanOrEqual(48);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(async () => distinct((await boxes()).map((b) => b.x))).toBe(3);

    await tile(page, "Create Alert").focus();
    await page.keyboard.press("Tab");
    await expect(tile(page, "Reports")).toBeFocused();
    expect(await tile(page, "Reports").evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  });
});

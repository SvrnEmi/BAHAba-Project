import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/*
 * Resident and guest screens: current alerts from active_alerts, the alert
 * history and "Reported on the ground", against a mocked
 * Supabase. Also checks small phones for sideways scrolling and tiny text.
 */

test.describe.configure({ timeout: 90_000 });

const ID = "00000000-0000-4000-8000-000000000051";
const EMAIL = "resident@test.local";
const BARANGAY = "Tuburan";
const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const session = () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: ID, email: EMAIL, role: "authenticated", aud: "authenticated", exp })}.sig`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: "refresh",
    user: { id: ID, aud: "authenticated", role: "authenticated", email: EMAIL, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
};

type Row = Record<string, unknown>;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const alertRow = (id: number, title: string, extra: Row = {}): Row => ({
  id, level: "warning", title, message: "Body", target_barangay: BARANGAY, created_by: "x", status: "approved", source: "mdrrmo", channels: "push",
  sent_at: minutesAgo(id), rejection_reason: null, withdrawn_reason: null, withdrawn_at: null, pagasa_color: "orange", pagasa_label: "Be Prepared", expires_at: null, is_all_clear: false, ...extra,
});
const observation = (id: number, location: string, status: string, minutes: number, extra: Row = {}) => ({ id, barangay: BARANGAY, kind: "waterway", location, status, note: null, observed_by: null, observed_at: minutesAgo(minutes), ...extra });

type Backend = { active: Row[]; alerts: Row[]; observations: Row[]; barangays: Row[]; reads: string[] };

async function mock(context: BrowserContext, seed: Partial<Backend> = {}, signedIn = true) {
  const db: Backend = { active: [], alerts: [], observations: [], barangays: [], reads: [], ...seed };
  await context.route(/supabase\.co/, (route) => route.abort());
  if (signedIn) {
    await context.route(/\/auth\/v1\/token/, (route) => route.fulfill({ json: session() }));
    await context.route(/\/auth\/v1\/user/, (route) => route.fulfill({ json: session().user }));
  }
  await context.route(/\/rest\/v1\//, (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split("/rest/v1/")[1];
    const one = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const headers = { "content-range": "0-0/1", "access-control-expose-headers": "Content-Range" };
    if (req.method() === "HEAD") return route.fulfill({ status: 200, headers, body: "" });
    db.reads.push(`${table}${decodeURIComponent(url.search)}`);
    if (table === "profiles") {
      if (url.searchParams.get("select")?.startsWith("id,")) return route.fulfill({ json: one ? null : [], headers });
      const row = { id: ID, role: "resident", name: "Ana", email: EMAIL, phone: "09170000000", barangay: BARANGAY };
      return route.fulfill({ json: one ? row : [row] });
    }
    if (table === "barangays") return route.fulfill({ json: db.barangays, headers });
    if (table === "active_alerts") return route.fulfill({ json: db.active, headers });
    if (table === "alerts") return route.fulfill({ json: db.alerts, headers });
    if (table === "field_observations") {
      const b = url.searchParams.get("barangay")?.replace("eq.", "");
      return route.fulfill({ json: db.observations.filter((o) => o.barangay === b), headers });
    }
    return route.fulfill({ json: one ? null : [], headers });
  });
  return db;
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("your.email@example.com").fill(EMAIL);
  await page.getByPlaceholder("Enter your password").fill("password123");
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("**/home");
}

test.describe("Current alerts", () => {
  test("come from active_alerts: an ended alert in the table is not listed or counted", async ({ page, context }) => {
    const db = await mock(context, {
      active: [alertRow(1, "Still active")],
      alerts: [alertRow(1, "Still active"), alertRow(2, "Already ended", { expires_at: minutesAgo(5) })],
    });
    await signIn(page);
    await expect(page.getByText("Still active")).toBeVisible();
    await expect(page.getByRole("button", { name: "Alerts, 1 unread" })).toBeVisible();

    await page.getByRole("link", { name: "Alerts", exact: true }).click();
    await expect(page.getByRole("button", { name: /Still active/ })).toBeVisible();
    await expect(page.getByText("Already ended")).toHaveCount(0);

    const reads = db.reads.filter((r) => r.startsWith("alerts?"));
    expect(reads).toEqual([]);
    expect(db.reads.some((r) => r.startsWith("active_alerts?"))).toBe(true);
  });

  test("an all clear is green with its own label, also on Home", async ({ page, context }) => {
    await mock(context, { active: [alertRow(1, "ALL CLEAR: Tuburan", { level: "advisory", is_all_clear: true })] });
    await signIn(page);
    await expect(page.getByText("ALL CLEAR: Tuburan")).toBeVisible();

    await page.getByRole("link", { name: "Alerts", exact: true }).click();
    const card = page.getByRole("button", { name: /^All clear: ALL CLEAR: Tuburan/ }).locator("xpath=ancestor::article");
    await expect(card.locator(".risk-badge-low", { hasText: "All clear" })).toBeVisible();
    await expect(card.getByText("Yellow - Be Alert")).toHaveCount(0);
    const color = (name: string) => card.evaluate((el, n) => getComputedStyle(el).getPropertyValue(n).trim(), name);
    expect(await color("--alert-color")).toBe(await color("--risk-low"));
  });

  test("an active alert keeps its PAGASA colour and label", async ({ page, context }) => {
    await mock(context, { active: [alertRow(1, "Keep watch")] });
    await signIn(page);
    await page.getByRole("link", { name: "Alerts", exact: true }).click();
    const card = page.getByRole("button", { name: /Keep watch/ }).locator("xpath=ancestor::article");
    await expect(card.getByText("Orange - Be Prepared")).toBeVisible();
    await expect(card.getByText("All clear")).toHaveCount(0);
  });

  test("the map shows the newest current alert and opens Alerts", async ({ page, context }) => {
    await mock(context, { active: [alertRow(1, "Map notice"), alertRow(2, "Older notice")] });
    await signIn(page);
    await page.getByRole("link", { name: "Map", exact: true }).click();
    const banner = page.getByRole("link", { name: /Map notice/ });
    await expect(banner).toContainText("Orange - Be Prepared");
    await expect(banner).toContainText("+1 more");
    await banner.click();
    await expect(page).toHaveURL(/\/alerts$/);
  });

  test("the history stays on the alerts table and marks ended alerts", async ({ page, context }) => {
    const db = await mock(context, { alerts: [alertRow(1, "Old alert", { expires_at: minutesAgo(5) }), alertRow(2, "Open alert")] });
    await signIn(page);
    await page.goto("/alerts/all");
    const ended = page.getByRole("button", { name: /Old alert/ });
    await expect(ended.locator(".risk-badge", { hasText: /^Ended$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Open alert/ }).locator(".risk-badge", { hasText: /^Ended$/ })).toHaveCount(0);
    expect(db.reads.some((r) => r.startsWith("alerts?"))).toBe(true);
  });
});

test.describe("Reported on the ground", () => {
  test("latest per place, status words, note, age, out-of-date mark", async ({ page, context }) => {
    await mock(context, {
      observations: [
        observation(4, "Tuburan creek", "overflowing", 5, { note: "Over the banks" }),
        observation(3, "tuburan creek", "normal", 200),
        observation(2, "Main road", "impassable", 120, { kind: "road" }),
        observation(1, "Old bridge", "passable", 7 * 60, { kind: "road" }),
      ],
    });
    await signIn(page);
    const card = page.getByRole("region", { name: "Reported on the ground" });
    await expect(card.locator("li")).toHaveCount(3);
    await expect(card.locator("li").nth(0)).toContainText("Overflowing");
    await expect(card.locator("li").nth(0)).toContainText("Over the banks");
    await expect(card.locator("li").nth(0)).toContainText("5 minutes ago");
    await expect(card.locator("li").nth(1)).toContainText("Not passable");
    await expect(card.locator("li").nth(1)).toContainText("2 hours ago");
    await expect(card.locator("li").nth(1)).not.toContainText("may be out of date");
    const old = card.locator("li").nth(2);
    await expect(old).toContainText("may be out of date");
    await expect(old).toHaveAttribute("data-stale", "true");
    await expect(old.locator(".risk-badge-neutral")).toHaveText("Passable");
  });

  test("empty state on Home", async ({ page, context }) => {
    await mock(context, { observations: [] });
    await signIn(page);
    await expect(page.getByText("No on-the-ground reports from your barangay yet.")).toBeVisible();
  });

  test("the map details show the barangay that was tapped", async ({ page, context }) => {
    const zone = (id: number, name: string) => ({ id, name, lat: 12.4, lng: 122, flood_risk: "low", risk_source: "auto", last_update: minutesAgo(5) });
    await mock(context, {
      barangays: [zone(1, "Amatong"), zone(2, BARANGAY)],
      observations: [observation(1, "Amatong creek", "rising", 20, { barangay: "Amatong" })],
    });
    await signIn(page);
    await page.getByRole("link", { name: "Map", exact: true }).click();

    const view = (name: string) => page.locator(".clay", { hasText: name }).getByRole("button", { name: "View" });
    await view("Amatong").click();
    const card = page.getByRole("region", { name: "Reported on the ground" });
    await expect(card).toContainText("From officials in Amatong");
    await expect(card).toContainText("Amatong creek");
    await page.getByRole("button", { name: "Close" }).click();

    await view(BARANGAY).click();
    await expect(page.getByText("No on-the-ground reports from your barangay yet.")).toBeVisible();
  });

  test("guests pick a barangay", async ({ page, context }) => {
    await mock(context, { observations: [observation(1, "Amatong creek", "rising", 30, { barangay: "Amatong" })] }, false);
    await page.goto("/");
    await page.getByRole("button", { name: "Conditions on the ground" }).click();
    await expect(page).toHaveURL(/\/conditions$/);
    await expect(page.getByRole("region", { name: "Reported on the ground" })).toHaveCount(0);
    await page.getByLabel("Barangay").selectOption("Amatong");
    await expect(page.getByRole("region", { name: "Reported on the ground" })).toContainText("Amatong creek");
    await page.getByLabel("Barangay").selectOption("Tuburan");
    await expect(page.getByText("No on-the-ground reports from Tuburan yet.")).toBeVisible();
  });
});

test.describe("Small phones", () => {
  const long = "A very long place name beside the old bridge near the public market area";
  const seed = {
    active: [alertRow(1, "An alert with quite a long title about the flooding near the river", { message: "Stay alert" })],
    observations: [observation(1, long, "overflowing", 7 * 60, { note: "Water is over the road and still rising fast" })],
  };

  const smallText = (page: Page) =>
    page.evaluate(() => {
      const found: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        const text = node.textContent?.trim();
        if (!parent || !text || parent.closest("script,style,.sr-only,svg")) continue;
        const size = parseFloat(getComputedStyle(parent).fontSize);
        if (size < 12) found.push(`${size}px: ${text.slice(0, 30)}`);
      }
      return found;
    });
  const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  test("resident screens fit 320px with no text under 12px", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 320, height: 568 } });
    await mock(context, seed);
    const page = await context.newPage();
    await signIn(page);
    await expect(page.getByRole("region", { name: "Reported on the ground" })).toContainText(long);
    for (const path of ["/home", "/alerts", "/alerts/all", "/map"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await sideways(page), path).toBeLessThanOrEqual(0);
      expect(await smallText(page), path).toEqual([]);
    }
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link")).toHaveCount(4);
    for (const link of await nav.getByRole("link").all()) await expect(link).toBeInViewport();
    await context.close();
  });

  test("guest pages fit 320px; Welcome still fits a normal phone", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 320, height: 568 } });
    await mock(context, seed, false);
    const page = await context.newPage();
    for (const path of ["/", "/conditions"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await sideways(page), path).toBeLessThanOrEqual(0);
      expect(await smallText(page), path).toEqual([]);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(0);
    await context.close();
  });
});

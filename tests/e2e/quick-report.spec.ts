import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/*
 * Quick Report (public) and the MDRRMO review tab, against a mocked Supabase:
 * the quick-report Edge Function, storage and the quick_reports table.
 */

const MDRRMO = { id: "00000000-0000-4000-8000-000000000003", email: "mdrrmo@test.local" };
const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: MDRRMO.id, aud: "authenticated", role: "authenticated", email: MDRRMO.email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  return {
    access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: MDRRMO.id, email: MDRRMO.email, role: "authenticated", aud: "authenticated", exp })}.sig`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: "refresh-mdrrmo",
    user,
  };
}

type Row = Record<string, unknown>;
const baseRow = (id: number, extra: Row = {}): Row => ({
  id,
  created_at: "2026-10-17T02:00:00Z",
  barangay: "Poblacion",
  landmark: "Near the plaza",
  lat: 12.4018,
  lng: 122.0234,
  water_level: "waist",
  description: "Water rising fast",
  photo_path: null,
  reporter_name: "Juan",
  reporter_phone: "0917 000 0000",
  status: "pending",
  rejection_reason: null,
  flagged_false: false,
  flag_reason: null,
  reviewed_at: null,
  ...extra,
});

async function mockBackend(context: BrowserContext, opts: { status?: Row; submit?: Row; submitStatus?: number; rows?: Row[] } = {}) {
  const calls = { fn: [] as Row[], patches: [] as { url: string; body: Row }[], selects: [] as string[], uploads: 0 };
  await context.route(/\/functions\/v1\/quick-report/, async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as Row;
    calls.fn.push(body);
    if (body.action === "status") return route.fulfill({ json: opts.status ?? { max: 3, remaining: 3, blocked: false } });
    return route.fulfill({ status: opts.submitStatus ?? 200, json: opts.submit ?? { ok: true, id: 9, remaining: 2, upload: null } });
  });
  await context.route(/\/storage\/v1\/object\/upload\/sign\//, (route) => {
    calls.uploads++;
    return route.fulfill({ status: 400, json: { message: "upload rejected" } });
  });
  await context.route(/\/storage\/v1\/object\/sign\//, (route) => route.fulfill({ status: 400, json: { message: "not found" } }));
  await context.route(/\/auth\/v1\/token/, (route) => route.fulfill({ json: session() }));
  await context.route(/\/auth\/v1\/user/, (route) => route.fulfill({ json: session().user }));
  await context.route(/\/rest\/v1\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split("/rest/v1/")[1];
    if (table === "profiles") return route.fulfill({ json: [{ id: MDRRMO.id, role: "mdrrmo", name: "Test MDRRMO" }] });
    if (table === "quick_reports") {
      if (req.method() === "PATCH") {
        calls.patches.push({ url: req.url(), body: JSON.parse(req.postData() ?? "{}") as Row });
        return route.fulfill({ json: [{ id: 1 }] });
      }
      calls.selects.push(url.searchParams.get("select") ?? "");
      if (req.method() === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": "0-0/1", "access-control-expose-headers": "content-range", "access-control-allow-origin": "*" }, body: "" });
      return route.fulfill({ json: opts.rows ?? [] });
    }
    if (req.method() === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": "0-0/0" }, body: "" });
    return route.fulfill({ json: [] });
  });
  await context.route(/\/realtime\/v1\//, (route) => route.abort());
  return calls;
}

const pngFile = () => ({
  name: "flood.png",
  mimeType: "image/png",
  // 1x1 PNG
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
});

async function fillMinimal(page: Page) {
  await page.getByRole("button", { name: "Knee" }).click();
  await page.locator("select").selectOption("Poblacion");
}

test.describe("Quick Report (public)", () => {
  test("Welcome page: logo, heading, hotlines with numbers, footer, and each button's target", async ({ page, context }) => {
    await mockBackend(context);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "BAHAba" })).toBeVisible();
    await expect(page.getByText("Flood early warning and community reports for Odiongan")).toBeVisible();
    await expect(page.locator("main img").first()).toBeVisible(); // logo (Vite may inline it as a data: URL)
    await expect(page.locator('a[href="tel:+639190798427"]')).toHaveText(/Call MDRRMO\s*\+63 919 079 8427/);
    await expect(page.locator('a[href="tel:911"]')).toHaveText(/Call 911/);
    await expect(page.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");

    // Fits a phone screen without scrolling.
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(overflow).toBeLessThanOrEqual(0);

    for (const [name, target] of [
      ["Log in", /\/login$/],
      ["Create an account", /\/register$/],
      [/Quick Report - no account needed/, /\/quick-report$/],
    ] as const) {
      await page.goto("/");
      await page.getByRole("button", { name }).click();
      await expect(page).toHaveURL(target);
      await page.getByRole("link", { name: "Back" }).or(page.getByRole("button", { name: "Back" })).first().click();
      await expect(page).toHaveURL(/\/$/);
    }
  });

  test("login page no longer has Quick Report or the emergency block", async ({ page, context }) => {
    await mockBackend(context);
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
    await expect(page.getByText(/Quick Report/)).toHaveCount(0);
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/");
    await expect(page.getByRole("link", { name: "Privacy Policy" })).toBeVisible();
  });

  test("validates, sends device_id + honeypot, and shows the success screen", async ({ page, context }) => {
    const calls = await mockBackend(context);
    await page.goto("/quick-report");
    await expect(page.getByText("You can send 3 more Quick Reports.")).toBeVisible();
    await page.getByRole("button", { name: "Send Quick Report" }).click();
    await expect(page.getByText("Choose how deep the water is.")).toBeVisible();
    await expect(page.getByText("Choose a barangay or use your location.")).toBeVisible();
    expect(calls.fn.filter((c) => c.action === "submit")).toHaveLength(0);

    await fillMinimal(page);
    await page.getByRole("button", { name: "Send Quick Report" }).click();
    await expect(page.getByText("Report sent. The MDRRMO will review it.")).toBeVisible();
    await expect(page.getByText("You can send 2 more Quick Reports.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send another" })).toBeVisible();

    const submit = calls.fn.find((c) => c.action === "submit")!;
    expect(submit).toMatchObject({ water_level: "knee", barangay: "Poblacion", website: "" });
    expect(String(submit.device_id)).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls.fn[0].device_id).toBe(submit.device_id);
    expect(await page.evaluate(() => localStorage.getItem("bahaba_device_id"))).toBe(submit.device_id);
  });

  test("used all 3: form disabled with Sign up and hotlines", async ({ page, context }) => {
    await mockBackend(context, { status: { max: 3, remaining: 0, blocked: false } });
    await page.goto("/quick-report");
    await expect(page.getByText("You have used all 3 Quick Reports. Create an account to keep reporting.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign up" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send Quick Report" })).toHaveCount(0);
    await expect(page.locator('a[href="tel:911"]')).toBeVisible();
  });

  test("blocked device sees the message and hotlines only", async ({ page, context }) => {
    await mockBackend(context, { status: { max: 3, remaining: 2, blocked: true } });
    await page.goto("/quick-report");
    await expect(page.getByText(/can no longer send Quick Reports/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Send Quick Report" })).toHaveCount(0);
    await expect(page.locator('a[href="tel:+639190798427"]')).toBeVisible();
  });

  test("server error text is shown (limit code)", async ({ page, context }) => {
    await mockBackend(context, { submitStatus: 429, submit: { error: "Daily limit reached for this network.", code: "ip_limit" } });
    await page.goto("/quick-report");
    await fillMinimal(page);
    await page.getByRole("button", { name: "Send Quick Report" }).click();
    await expect(page.getByText("Daily limit reached for this network.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send Quick Report" })).toBeEnabled();
  });

  test("photo is compressed, requested, and an upload failure is explained", async ({ page, context }) => {
    const calls = await mockBackend(context, {
      submit: { ok: true, id: 10, remaining: 1, upload: { path: "q/10.jpg", token: "tok", signed_url: "https://example.invalid" } },
    });
    await page.goto("/quick-report");
    await fillMinimal(page);
    await page.locator('input[type="file"]').setInputFiles(pngFile());
    await expect(page.getByAltText("Selected flood photo")).toBeVisible();
    await page.getByRole("button", { name: "Send Quick Report" }).click();
    await expect(page.getByText("Report sent. The MDRRMO will review it.")).toBeVisible();
    await expect(page.getByText("Your report was sent, but the photo could not be uploaded.")).toBeVisible();
    expect(calls.fn.find((c) => c.action === "submit")).toMatchObject({ want_photo: true, photo_ext: "jpg" });
    expect(calls.uploads).toBe(1);
  });
});

test.describe("Terms and Privacy pages", () => {
  test("are public, render the documents, and are linked from Quick Report", async ({ page, context }) => {
    await mockBackend(context);
    await page.goto("/terms");
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole("heading", { level: 1, name: "BAHAba Terms of Service" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Quick Report (no account)" })).toBeVisible();
    await expect(page.locator("strong", { hasText: "BAHAba is an information aid." })).toBeVisible();

    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "BAHAba Privacy Policy" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Why we collect it" })).toBeVisible();
    await expect(page.getByRole("cell", { name: /random device ID/ })).toBeVisible();
    await expect(page.getByText("Phone: +63 919 079 8427")).toBeVisible();

    await page.goto("/quick-report");
    await page.getByRole("link", { name: "Privacy Policy" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { level: 1, name: "BAHAba Privacy Policy" })).toBeVisible();
  });
});

test.describe("MDRRMO Quick Reports review", () => {
  async function openTab(page: Page) {
    await page.goto("/login");
    await page.getByPlaceholder("your.email@example.com").fill(MDRRMO.email);
    await page.getByPlaceholder("Enter your password").fill("password123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/admin\/mdrrmo$/);
    await page.getByRole("tab", { name: /Quick Reports/ }).click();
  }

  test("lists with explicit columns, shows details, and approves with only status", async ({ page, context }) => {
    const calls = await mockBackend(context, { rows: [baseRow(1, { photo_path: "q/1.jpg" })] });
    await openTab(page);
    await expect(page.getByRole("tab", { name: /Quick Reports\s*1/ })).toBeVisible();
    const card = page.locator("article").first();
    await expect(card.getByText("Water: Waist (High)")).toBeVisible();
    await expect(card.getByText("Pending review")).toBeVisible();
    await expect(card.getByRole("link", { name: "View on map" })).toHaveAttribute("href", /12\.4018,122\.0234/);
    await expect(card.locator('a[href^="tel:"]')).toHaveText(/0917 000 0000/);
    await expect(card.getByText("Photo unavailable")).toBeVisible();
    await expect(card.getByText(/PHT/)).toBeVisible();

    expect(calls.selects.length).toBeGreaterThan(0);
    for (const s of calls.selects) expect(s).not.toContain("*");
    expect(calls.selects.some((s) => s.includes("reporter_phone") && s.includes("flag_reason"))).toBe(true);

    await card.getByRole("button", { name: "Approve" }).click();
    await expect.poll(() => calls.patches.length).toBe(1);
    expect(calls.patches[0].body).toEqual({ status: "approved" });
    expect(calls.patches[0].url).toContain("id=eq.1");
  });

  test("reject and flag require a reason; flag warns about blocking; unflag lifts it", async ({ page, context }) => {
    const calls = await mockBackend(context, { rows: [baseRow(2)] });
    await openTab(page);
    const card = page.locator("article").first();

    await card.getByRole("button", { name: "Reject" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Reject" })).toBeDisabled();
    await dialog.getByLabel("Reason (required)").fill("Duplicate of an earlier report");
    await dialog.getByRole("button", { name: "Reject" }).click();
    await expect.poll(() => calls.patches.length).toBe(1);
    expect(calls.patches[0].body).toEqual({ status: "rejected", rejection_reason: "Duplicate of an earlier report" });

    await card.getByRole("button", { name: "Flag as false" }).click();
    await expect(page.getByRole("dialog").getByText("This will block the sending device from using Quick Report again.")).toBeVisible();
    await page.getByRole("dialog").getByLabel("Reason (required)").fill("Prank report");
    await page.getByRole("dialog").getByRole("button", { name: "Flag as false" }).click();
    await expect.poll(() => calls.patches.length).toBe(2);
    expect(calls.patches[1].body).toEqual({ flagged_false: true, flag_reason: "Prank report" });
  });

  test("flagged report offers Unflag, and the empty state shows", async ({ page, context }) => {
    const calls = await mockBackend(context, { rows: [baseRow(3, { flagged_false: true, flag_reason: "Prank" })] });
    await openTab(page);
    const card = page.locator("article").first();
    await expect(card.getByText("Flagged as false").first()).toBeVisible();
    await card.getByRole("button", { name: "Unflag" }).click();
    await expect.poll(() => calls.patches.length).toBe(1);
    expect(calls.patches[0].body).toEqual({ flagged_false: false });
  });

  test("empty filter shows the empty state", async ({ page, context }) => {
    await mockBackend(context, { rows: [] });
    await openTab(page);
    await expect(page.getByText("No quick reports here")).toBeVisible();
  });
});

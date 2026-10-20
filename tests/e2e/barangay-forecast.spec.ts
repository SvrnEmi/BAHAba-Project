import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/*
 * Barangay admin "status and forecast" panel against a mocked Supabase.
 * The barangays row is read with explicit columns; Return to automatic goes
 * through the barangay_return_to_auto RPC.
 */

test.describe.configure({ timeout: 90_000 });

const ADMIN = { id: "00000000-0000-4000-8000-000000000021", email: "brgy-admin@test.local" };
const MIN = 60 * 1000;

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: ADMIN.id, email: ADMIN.email, role: "authenticated", aud: "authenticated", exp })}.sig`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: "refresh-brgy",
    user: { id: ADMIN.id, aud: "authenticated", role: "authenticated", email: ADMIN.email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
}

type BarangayRow = Record<string, unknown>;
const baseRow = (overrides: BarangayRow): BarangayRow => ({
  id: 7,
  name: "Poblacion",
  flood_risk: "low",
  risk_source: "auto",
  manual_override_until: null,
  auto_risk: "low",
  forecast_6h: "low",
  forecast_12h: "low",
  forecast_24h: "low",
  rain_past_24h: 12.4,
  rain_next_3h: 3.1,
  rain_next_24h: 40.2,
  peak_rain_mm_h: 9.6,
  peak_rain_at: new Date(Date.now() + 5 * 60 * MIN).toISOString(),
  auto_updated_at: new Date(Date.now() - 10 * MIN).toISOString(),
  last_update: new Date(Date.now() - 60 * MIN).toISOString(),
  ...overrides,
});

async function mock(context: BrowserContext, initial: BarangayRow) {
  const state = { row: initial, rpcCalls: [] as unknown[], barangaySelects: [] as string[] };
  await context.route(/\/auth\/v1\/token/, (route) => route.fulfill({ json: session() }));
  await context.route(/\/auth\/v1\/user/, (route) => route.fulfill({ json: session().user }));
  await context.route(/\/realtime\/v1\//, (route) => route.abort());
  await context.route(/\/rest\/v1\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.split("/rest/v1/")[1];
    const wantsObject = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const one = (row: unknown) => route.fulfill({ json: wantsObject ? row : row == null ? [] : [row] });
    if (req.method() === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": "0-0/0" }, body: "" });
    if (path === "profiles") return one({ id: ADMIN.id, role: "barangay", name: "Kap. Test", email: ADMIN.email, phone: null, barangay: "Poblacion" });
    if (path === "barangays") {
      state.barangaySelects.push(url.searchParams.get("select") ?? "");
      return one(state.row);
    }
    if (path === "risk_settings") return one({ override_hours: 6 });
    if (path === "rpc/barangay_return_to_auto") {
      state.rpcCalls.push(JSON.parse(req.postData() ?? "{}"));
      state.row = { ...state.row, flood_risk: state.row.auto_risk, risk_source: "auto", manual_override_until: null };
      return route.fulfill({ json: state.row.auto_risk });
    }
    return route.fulfill({ json: wantsObject ? null : [] });
  });
  return state;
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("your.email@example.com").fill(ADMIN.email);
  await page.getByPlaceholder("Enter your password").fill("password123");
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("**/admin/barangay");
}

test("manual level below the forecast: warning, stale notice, Rising, and Return to automatic", async ({ browser }) => {
  const context = await browser.newContext();
  const state = await mock(
    context,
    baseRow({
      flood_risk: "low",
      risk_source: "manual",
      manual_override_until: new Date(Date.now() + 3 * 60 * MIN).toISOString(),
      auto_risk: "high",
      forecast_6h: "medium",
      forecast_12h: "high",
      forecast_24h: "high",
      auto_updated_at: new Date(Date.now() - 2 * 60 * MIN).toISOString(),
    }),
  );
  const page = await context.newPage();
  await signIn(page);
  const panel = page.locator("#barangay-status");

  await expect(panel.getByText(/^Set by you until /)).toBeVisible();
  await expect(panel.getByText("Forecast may be out of date")).toBeVisible();
  await expect(panel.getByText("Rising", { exact: true })).toBeVisible();
  await expect(panel.getByText("Past 24 h")).toBeVisible();
  await expect(panel.getByText("12.4")).toBeVisible();
  await expect(panel.getByText("The forecast is higher than your setting.")).toBeVisible();
  // Explicit columns, never select=*.
  expect(state.barangaySelects.every((s) => s !== "*" && s.includes("auto_updated_at"))).toBe(true);

  // Only one Return to automatic button while the warning shows (inside it).
  await expect(panel.getByRole("button", { name: "Return to automatic" })).toHaveCount(1);
  await panel.getByRole("button", { name: "Return to automatic" }).click();
  await expect(panel.getByText("Back to automatic: High risk.")).toBeVisible();
  expect(state.rpcCalls).toEqual([{ p_barangay: "Poblacion" }]);
  await expect(panel.getByText("The forecast is higher than your setting.")).toHaveCount(0);
  await expect(panel.getByText("Automatic", { exact: true })).toBeVisible();
  await expect(panel.getByText("Steady", { exact: true })).toBeVisible();
  await context.close();
});

test("automatic and fresh: Falling trend, no stale notice, no warning", async ({ browser }) => {
  const context = await browser.newContext();
  await mock(context, baseRow({ flood_risk: "high", auto_risk: "high", forecast_6h: "high", forecast_12h: "medium", forecast_24h: "low" }));
  const page = await context.newPage();
  await signIn(page);
  const panel = page.locator("#barangay-status");

  await expect(panel.getByText("Automatic", { exact: true })).toBeVisible();
  await expect(panel.getByText("Falling", { exact: true })).toBeVisible();
  await expect(panel.getByText(/^Updated 10 minutes ago/)).toBeVisible();
  await expect(panel.getByText("Forecast may be out of date")).toHaveCount(0);
  await expect(panel.getByText("The forecast is higher than your setting.")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Return to automatic" })).toHaveCount(0);
  await context.close();
});

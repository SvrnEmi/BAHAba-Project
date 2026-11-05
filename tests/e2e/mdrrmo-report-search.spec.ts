import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/*
 * MDRRMO Community Reports: server-side search, sort, status chips and
 * pages, against a mocked Supabase. The mock community_reports table
 * evaluates the PostgREST query the page sends (or=ilike, in, not.in,
 * order, offset/limit, exact counts), so a wrong query shows up as wrong
 * rows. Data: the 5 live reports plus 40 generated ones.
 */

test.describe.configure({ timeout: 90_000 });

const MDRRMO = { id: "00000000-0000-4000-8000-000000000014", email: "mdrrmo@test.local" };

type Report = {
  id: number;
  user_name: string;
  location: string;
  lat: number | null;
  lng: number | null;
  water_level: string;
  description: string;
  photo_path: string | null;
  status: string;
  timestamp: string;
  rejection_reason: string | null;
  approval_reason: string | null;
  user_id: string | null;
  admin_reply: string | null;
  admin_reply_at: string | null;
  barangay: string | null;
};

const base = { lat: null, lng: null, photo_path: null, rejection_reason: null, approval_reason: null, user_id: null, admin_reply: null, admin_reply_at: null };
const LIVE: Report[] = [
  { ...base, id: 19, location: "tabning sea", description: "test 10", user_name: "jm", barangay: null, water_level: "waist", status: "approved", timestamp: "2026-09-26T12:47:55Z" },
  { ...base, id: 18, location: "test 9", description: "test 9", user_name: "jm", barangay: null, water_level: "ankle", status: "approved", timestamp: "2026-09-25T14:21:54Z" },
  { ...base, id: 17, location: "ligaya", description: "test", user_name: "JM Cordero", barangay: null, water_level: "ankle", status: "approved", timestamp: "2026-09-14T03:17:22Z" },
  { ...base, id: 16, location: "tabing sea", description: "test 2", user_name: "tagabarangaytuburan", barangay: null, water_level: "ankle", status: "approved", timestamp: "2026-09-12T10:44:42Z" },
  { ...base, id: 15, location: "tabing sea", description: "test 1", user_name: "JM Cordero", barangay: null, water_level: "ankle", status: "approved", timestamp: "2026-09-12T10:43:04Z" },
];
const LEVELS = ["ankle", "knee", "waist", "chest", "overhead"];
const STATUSES = ["pending", "approved", "rejected", "verified"];
const BARANGAYS = ["Poctoy", "Dapawan", "Tabing Dagat", null];
const GENERATED: Report[] = Array.from({ length: 40 }, (_, i) => ({
  ...base,
  id: 100 + i,
  location: `Generated street ${i}`,
  description: `generated row ${i}`,
  user_name: `resident${i}`,
  barangay: BARANGAYS[i % 4],
  water_level: LEVELS[i % 5],
  status: STATUSES[i % 4],
  timestamp: new Date(Date.parse("2026-08-01T00:00:00Z") + i * 3_600_000).toISOString(),
}));
const ALL = [...LIVE, ...GENERATED];

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: MDRRMO.id, email: MDRRMO.email, role: "authenticated", aud: "authenticated", exp })}.sig`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: "refresh-mdrrmo",
    user: { id: MDRRMO.id, aud: "authenticated", role: "authenticated", email: MDRRMO.email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
}

const list = (v: string) => v.replace(/^\(|\)$/g, "").split(",");
const ilike = (value: unknown, pattern: string) =>
  new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`, "i").test(String(value ?? ""));

/** Applies column filters (all must hold), or=(...), order and offset/limit like PostgREST. */
function evaluate(url: URL) {
  let rows = [...ALL];
  for (const [key, value] of url.searchParams) {
    if (key === "or") {
      const parts = list(value).map((p) => p.match(/^(\w+)\.ilike\.(.*)$/)!);
      rows = rows.filter((r) => parts.some(([, col, pat]) => ilike(r[col as keyof Report], pat)));
    } else if (!["select", "order", "offset", "limit"].includes(key)) {
      const col = key as keyof Report;
      if (value.startsWith("in.")) rows = rows.filter((r) => list(value.slice(3)).includes(String(r[col])));
      else if (value.startsWith("not.in.")) rows = rows.filter((r) => !list(value.slice(7)).includes(String(r[col])));
      else if (value.startsWith("eq.")) rows = rows.filter((r) => String(r[col]) === value.slice(3));
    }
  }
  const order = (url.searchParams.get("order") ?? "").split(",").filter(Boolean).map((o) => o.split("."));
  rows.sort((a, b) => {
    for (const [col, dir, nulls] of order) {
      const x = a[col as keyof Report];
      const y = b[col as keyof Report];
      if (x === y) continue;
      if (x === null) return nulls === "nullsfirst" ? -1 : 1;
      if (y === null) return nulls === "nullsfirst" ? 1 : -1;
      const c = String(x).localeCompare(String(y));
      return dir === "desc" ? -c : c;
    }
    return 0;
  });
  const total = rows.length;
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : total;
  return { rows: rows.slice(offset, offset + limit), total };
}

async function attach(context: BrowserContext, requests: string[]) {
  await context.route(/\/auth\/v1\/token/, (route) => route.fulfill({ json: session() }));
  await context.route(/\/auth\/v1\/user/, (route) => route.fulfill({ json: session().user }));
  await context.route(/\/auth\/v1\/logout/, (route) => route.fulfill({ status: 204, body: "" }));
  await context.route(/\/realtime\/v1\//, (route) => route.abort());
  await context.route(/\/rest\/v1\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split("/rest/v1/")[1];
    const wantsObject = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    if (table === "profiles" && !url.searchParams.get("select")?.startsWith("id")) {
      const row = { id: MDRRMO.id, role: "mdrrmo", name: "Test MDRRMO", email: MDRRMO.email, phone: "09170000000", barangay: "Poctoy" };
      return route.fulfill({ json: wantsObject ? row : [row] });
    }
    if (table === "community_reports") {
      requests.push(decodeURIComponent(url.search));
      const { rows, total } = evaluate(url);
      const range = rows.length ? `0-${rows.length - 1}/${total}` : `*/${total}`;
      if (req.method() === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": range, "access-control-expose-headers": "Content-Range" }, body: "" });
      return route.fulfill({ json: rows, headers: { "content-range": range, "access-control-expose-headers": "Content-Range" } });
    }
    if (req.method() === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": "*/0" }, body: "" });
    return route.fulfill({ json: wantsObject ? null : [] });
  });
}

async function openReports(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("your.email@example.com").fill(MDRRMO.email);
  await page.getByPlaceholder("Enter your password").fill("password123");
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("**/admin/mdrrmo");
  // 10 pending reports open the "Pending review" summary first.
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.getByRole("tab", { name: /Verify Reports|Reports/ }).first().click();
  await expect(page.getByRole("heading", { name: "Community Reports Management" })).toBeVisible();
}

const cards = (page: Page) => page.locator('li > [id^="report-"]');
const ids = async (page: Page) => (await cards(page).evaluateAll((els) => els.map((e) => Number(e.id.replace("report-", "")))));
const search = (page: Page) => page.getByPlaceholder("Search reports (location, description, reporter, barangay)");

test("search, chips, sort and pages run on the server", async ({ browser }) => {
  const requests: string[] = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await attach(context, requests);
  const page = await context.newPage();
  await openReports(page);

  // Default: newest first, 20 per page, 45 reports, 3 pages.
  await expect(cards(page)).toHaveCount(20);
  expect((await ids(page)).slice(0, 5)).toEqual([19, 18, 17, 16, 15]);
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await expect(page.getByRole("tab", { name: "All (45)" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Pending (10)" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Approved (25)" })).toBeVisible(); // 5 live + 10 approved + 10 verified
  await expect(page.getByRole("tab", { name: "Rejected (10)" })).toBeVisible();
  // Explicit columns only.
  expect(requests.every((r) => !r.includes("select=*"))).toBe(true);
  expect(requests.some((r) => r.includes("select=id,user_name,location,lat,lng,water_level,description,photo_path,status,timestamp,rejection_reason,approval_reason,user_id,admin_reply,admin_reply_at,barangay"))).toBe(true);

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Page 2 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Page 3 of 3")).toBeVisible();
  await expect(cards(page)).toHaveCount(5);

  // Search "tabning": one match, page resets to 1, counts update.
  await search(page).fill("tabning");
  await expect(cards(page)).toHaveCount(1);
  expect(await ids(page)).toEqual([19]);
  await expect(page.getByText("1 matching report · 45 total reports")).toBeVisible();
  await expect(page.getByRole("tab", { name: "All (1)" })).toBeVisible();
  await expect(page.getByText(/Page \d of/)).toHaveCount(0);
  expect(requests.at(-1)).toContain("or=(description.ilike.%tabning%,location.ilike.%tabning%,user_name.ilike.%tabning%,barangay.ilike.%tabning%)");

  // "test 9": location and description of #18.
  await search(page).fill("test 9");
  await expect(cards(page)).toHaveCount(1);
  await expect.poll(() => ids(page)).toEqual([18]);

  // Clear (X) brings everything back.
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(cards(page)).toHaveCount(20);
  await expect(page.getByText("45 total reports", { exact: true })).toBeVisible();

  // Oldest first.
  await page.getByLabel("Sort reports").selectOption("oldest");
  await expect.poll(() => ids(page).then((x) => x.slice(0, 3))).toEqual([100, 101, 102]);

  // Water level deepest first: overhead, chest, waist, knee, ankle (not alphabetical), across pages.
  const levels = async () => cards(page).evaluateAll((els) => els.map((e) => e.textContent ?? ""));
  const rank = (text: string) => ["Over head", "Chest-deep", "Waist-deep", "Knee-deep", "Ankle-deep"].findIndex((l) => text.toLowerCase().includes(l.toLowerCase()));
  await page.getByLabel("Sort reports").selectOption("water_desc");
  const seen: number[] = [];
  for (let p = 1; p <= 3; p++) {
    await expect(page.getByText(`Page ${p} of 3`)).toBeVisible();
    await expect(cards(page)).toHaveCount(p < 3 ? 20 : 5);
    seen.push(...(await levels()).map(rank));
    if (p < 3) await page.getByRole("button", { name: "Next" }).click();
  }
  expect(seen).toHaveLength(45);
  expect(seen).toEqual([...seen].sort((a, b) => a - b));
  expect(seen.filter((r) => r === 0)).toHaveLength(8); // overhead

  // Shallowest first starts with ankle, page back at 1.
  await page.getByLabel("Sort reports").selectOption("water_asc");
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  expect((await levels()).slice(0, 12).map(rank).every((r) => r === 4)).toBe(true);

  // Pending chip + Status sort: 10 pending, one page.
  await page.getByRole("tab", { name: "Pending (10)" }).click();
  await expect(cards(page)).toHaveCount(10);
  await expect(page.getByText("10 matching reports · 45 total reports")).toBeVisible();

  // Empty state with Clear search.
  await page.getByRole("tab", { name: "All (45)" }).click();
  await search(page).fill("nothing like this");
  await expect(page.getByText("No reports match your search")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).last().click();
  await expect(cards(page)).toHaveCount(20);
  await context.close();
});

test("360 px: search and sort stack, no sideways scroll", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 760 } });
  await attach(context, []);
  const page = await context.newPage();
  await openReports(page);
  const box = await search(page).boundingBox();
  const sortBox = await page.getByLabel("Sort reports").boundingBox();
  expect(sortBox!.y).toBeGreaterThan(box!.y + box!.height - 1);
  expect(box!.width).toBeGreaterThan(250);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.screenshot({ path: "test-results/mdrrmo-report-search-360.png", fullPage: false });
  await context.close();
});

test("a change to the reports reloads the page in place (search, sort and page kept)", async ({ browser }) => {
  const requests: string[] = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await attach(context, requests);
  const page = await context.newPage();
  await openReports(page);
  await search(page).fill("generated");
  await page.getByLabel("Sort reports").selectOption("oldest");
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();

  // Same path as a realtime DELETE: the dashboard's reports list changes.
  const before = requests.length;
  page.once("dialog", (d) => void d.accept());
  await cards(page).first().click();
  await page.getByRole("button", { name: "Delete report" }).first().click();
  await expect.poll(() => requests.slice(before).some((r) => r.includes("offset="))).toBe(true);
  const reload = requests.slice(before).find((r) => r.includes("offset="))!;
  expect(reload).toContain("ilike.%generated%");
  expect(reload).toContain("order=timestamp.asc");
  expect(reload).toContain("offset=20");
  await expect(search(page)).toHaveValue("generated");
  await expect(page.getByLabel("Sort reports")).toHaveValue("oldest");
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await context.close();
});

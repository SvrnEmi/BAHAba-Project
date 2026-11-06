import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { dateBounds, readView, searchFilter, sortLoaded, sourceLabel, writeView, DEFAULT_VIEW } from "../../src/lib/allReports";

/*
 * Barangay All reports against a mocked Supabase (no real accounts or data).
 * The mock applies the same filters PostgREST would, so the requests are checked too.
 */

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

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
type Row = Record<string, unknown>;
const row = (n: number, over: Row = {}): Row => ({
  kind: "community", id: n, source: "resident", barangay: "Poctoy", location: `Place ${n}`, lat: null, lng: null, water_level: "knee", description: "Water rising",
  status: "pending", reported_at: ago(n), reporter_name: "Ana", photo_path: null, photo_bucket: "report-photos", rejection_reason: null, ...over,
});

const base = (): Row[] => [
  row(1),
  row(2, { source: "mdrrmo", status: "approved", water_level: "overhead", reporter_name: "MDRRMO Staff" }),
  row(3, { kind: "quick", source: "guest", water_level: "ankle", reporter_name: null, photo_bucket: "quick-report-photos" }),
  row(4, { source: "unknown", status: "rejected", rejection_reason: "Duplicate report", water_level: "waist" }),
  row(100, { water_level: "chest", reported_at: ago(24 * 20) }),
];

const manyRows = () => Array.from({ length: 30 }, (_, i) => row(i + 1));

type State = { rows: Row[]; requests: URL[]; fail?: string };

async function mock(context: BrowserContext, state: State) {
  await context.route(/\/auth\/v1\/token/, (route) => route.fulfill({ json: session }));
  await context.route(/\/auth\/v1\/user/, (route) => route.fulfill({ json: user }));
  await context.route(/\/rest\/v1\//, (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split("/rest/v1/")[1];
    if (route.request().method() === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": "0-0/0" }, body: "" });
    const single = route.request().headers()["accept"]?.includes("vnd.pgrst.object");
    if (table === "profiles") {
      const profile = { id, role: "barangay", name: "Test official", email, phone: "09170000000", barangay: "Poctoy" };
      return route.fulfill({ json: single ? profile : [profile] });
    }
    if (table === "all_reports") {
      state.requests.push(url);
      if (state.fail) return route.fulfill({ status: 400, json: { message: state.fail } });
      const q = url.searchParams;
      let rows = state.rows.filter((r) => `eq.${r.barangay}` === q.get("barangay"));
      for (const column of ["source", "status", "water_level"]) {
        const want = q.get(column);
        if (want?.startsWith("eq.")) rows = rows.filter((r) => r[column] === want.slice(3));
        if (want?.startsWith("in.")) rows = rows.filter((r) => want.includes(String(r[column])));
      }
      const search = q.get("or")?.match(/location\.ilike\."\*(.*?)\*"/)?.[1]?.toLowerCase();
      if (search) rows = rows.filter((r) => [r.location, r.description, r.reporter_name].some((v) => String(v ?? "").toLowerCase().includes(search)));
      for (const bound of q.getAll("reported_at")) {
        const [op, ...value] = bound.split(".");
        const limit = Date.parse(value.join("."));
        rows = rows.filter((r) => (op === "gte" ? Date.parse(String(r.reported_at)) >= limit : Date.parse(String(r.reported_at)) < limit));
      }
      const ascending = q.get("order")?.startsWith("reported_at.asc");
      rows = [...rows].sort((a, b) => (ascending ? 1 : -1) * (Date.parse(String(a.reported_at)) - Date.parse(String(b.reported_at))));
      const offset = Number(q.get("offset") ?? 0);
      const limit = Number(q.get("limit") ?? rows.length);
      return route.fulfill({ headers: { "content-range": `${offset}-${offset + limit - 1}/${rows.length}`, "access-control-expose-headers": "content-range", "access-control-allow-origin": "*" }, json: rows.slice(offset, offset + limit) });
    }
    if (table === "community_reports" && url.searchParams.has("id")) {
      return route.fulfill({ json: [{ id: 1, user_name: "Ana", location: "Place 1", lat: null, lng: null, water_level: "knee", description: "Water rising", photo_path: null, status: "pending", timestamp: ago(1), rejection_reason: null, approval_reason: null, barangay: "Poctoy" }] });
    }
    if (table === "quick_reports" && url.searchParams.has("id")) {
      return route.fulfill({ json: [{ id: 3, created_at: ago(3), barangay: "Poctoy", landmark: "Place 3", lat: null, lng: null, water_level: "ankle", description: "From a guest", photo_path: null, reporter_name: null, reporter_phone: null, status: "pending", rejection_reason: null, flagged_false: false, flag_reason: null, reviewed_by: null, reviewed_at: null }] });
    }
    return route.fulfill({ json: single ? null : [] });
  });
  await context.route(/\/realtime\/v1\//, (route) => route.abort());
}

async function open(page: Page, query = "") {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("your.email@example.com").fill(email);
  await page.getByPlaceholder("Enter your password").fill("password123");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/admin\/barangay/);
  if (query) await page.goto(`/admin/barangay${query}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tab", { name: "All reports" })).toHaveAttribute("aria-selected", "true");
}

const control = (page: Page, name: string) => page.locator(`label:has(span.clay-label:text-is("${name}")) select`);
const rowFor = (page: Page, name: string) => page.locator("li button", { has: page.locator(`span.truncate:text-is("${name}")`) });
const status = (page: Page) => page.getByRole("status").filter({ hasText: "Showing" });
const places = (page: Page) => page.locator("li button span.truncate").allInnerTexts();

test.describe("all reports rules", () => {
  test("search text stays inside the quoted value", () => {
    expect(searchFilter(`  a,b(c)  `)).toContain(`location.ilike."*a,b(c)*"`);
    expect(searchFilter("50%")).toContain(String.raw`location.ilike."*50\\%*"`);
    expect(searchFilter("a*b")).toContain(`location.ilike."*a_b*"`);
    expect(searchFilter("a_b")).toContain(String.raw`location.ilike."*a\\_b*"`);
    expect(searchFilter(`say "hi"`)).toContain(String.raw`location.ilike."*say \"hi\"*"`);
    expect(searchFilter("x").split(",").map((f) => f.split(".")[0])).toEqual(["location", "description", "reporter_name"]);
  });

  test("the URL round trip drops defaults and ignores unknown values", () => {
    const params = writeView(new URLSearchParams("tab=x"), { ...DEFAULT_VIEW, q: "bridge", source: "guest", page: 3 });
    expect(params.toString()).toBe("tab=x&q=bridge&source=guest&page=3");
    expect(readView(params)).toMatchObject({ q: "bridge", source: "guest", page: 3, sort: "newest" });
    expect(readView(new URLSearchParams("source=nope&sort=nope&page=-2&from=x"))).toEqual(DEFAULT_VIEW);
  });

  test("dates follow the Manila calendar", () => {
    const now = Date.parse("2026-11-06T16:30:00Z"); // 00:30 on Nov 7 in Manila
    expect(dateBounds({ date: "today", from: "", to: "" }, now).from).toBe("2026-11-06T16:00:00.000Z");
    expect(dateBounds({ date: "custom", from: "2026-11-01", to: "2026-11-02" }, now)).toEqual({ from: "2026-10-31T16:00:00.000Z", before: "2026-11-02T16:00:00.000Z" });
    expect(dateBounds({ date: "all", from: "2026-11-01", to: "" }, now)).toEqual({});
  });

  test("sorts loaded rows, with missing values last", () => {
    const rows = [
      { water_level: "knee", status: "rejected" },
      { water_level: null, status: "approved" },
      { water_level: "overhead", status: "pending" },
      { water_level: "ankle", status: "verified" },
    ];
    const levels = (sort: "highest" | "lowest") => sortLoaded(rows, sort).map((r) => r.water_level);
    expect(levels("highest")).toEqual(["overhead", "knee", "ankle", null]);
    expect(levels("lowest")).toEqual(["ankle", "knee", "overhead", null]);
    expect(sortLoaded(rows, "status").map((r) => r.status)).toEqual(["pending", "approved", "verified", "rejected"]);
  });

  test("source labels", () => {
    expect(["resident", "mdrrmo", "guest", "unknown", null].map(sourceLabel)).toEqual(["Resident", "MDRRMO", "Guest (Quick Report)", "Unknown (older report)", "Unknown (older report)"]);
  });
});

test.describe("all reports page", () => {
  test("lists every source for the own barangay only, with no actions", async ({ page, context }) => {
    const state: State = { rows: [...base(), row(5, { barangay: "Tuburan", location: "Elsewhere" })], requests: [] };
    await mock(context, state);
    await open(page);
    await expect(status(page)).toHaveText("Showing 5 of 5");
    expect(state.requests.every((u) => u.searchParams.get("barangay") === "eq.Poctoy")).toBe(true);
    expect(state.requests.at(-1)!.searchParams.get("select")).not.toContain("*");
    await expect(page.getByText("Elsewhere")).toHaveCount(0);
    for (const label of ["Resident", "MDRRMO", "Guest (Quick Report)", "Unknown (older report)"]) {
      await expect(page.locator("li").getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText("Rejection reason:")).toBeVisible();
    await expect(page.getByText("Duplicate report")).toBeVisible();
    await expect(page.locator("li time").first()).toHaveAttribute("title", /PHT$/);
    await expect(page.getByRole("button", { name: /^(Approve|Reject)/ })).toHaveCount(0);
  });

  test("search is debounced, escaped and counted", async ({ page, context }) => {
    const state: State = { rows: base(), requests: [] };
    await mock(context, state);
    await open(page);
    await expect(status(page)).toHaveText("Showing 5 of 5");
    const before = state.requests.length;
    await page.getByRole("searchbox").pressSequentially("place 1", { delay: 20 });
    await expect(page.getByRole("status").filter({ hasText: "results for" })).toContainText("2 results for 'place 1'");
    expect(state.requests.length).toBe(before + 1);
    await expect(page).toHaveURL(/q=place/);

    await page.getByRole("searchbox").fill("nothing here");
    await expect(page.getByText("No reports match your search")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(status(page)).toHaveText("Showing 5 of 5");
    await expect(page.getByRole("searchbox")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(0);
  });

  test("each filter narrows the list and the URL keeps it", async ({ page, context }) => {
    await mock(context, { rows: base(), requests: [] });
    await open(page);
    await control(page, "Source").selectOption("guest");
    await expect(status(page)).toHaveText("Showing 1 of 1");
    await control(page, "Source").selectOption("all");
    await control(page, "Status").selectOption("rejected");
    await expect(status(page)).toHaveText("Showing 1 of 1");
    await control(page, "Status").selectOption("all");
    await control(page, "Water level").selectOption("overhead");
    await expect(status(page)).toHaveText("Showing 1 of 1");
    await control(page, "Water level").selectOption("all");
    await control(page, "Date").selectOption("7d");
    await expect(status(page)).toHaveText("Showing 4 of 4");
    await control(page, "Date").selectOption("custom");
    await expect(page.locator('input[type="date"]').first()).toBeVisible();
    await page.locator('input[type="date"]').nth(1).fill("2020-01-01");
    await expect(page.getByText("No reports match your search")).toBeVisible();
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(control(page, "Date")).toHaveValue("all");
    await expect(status(page)).toHaveText("Showing 5 of 5");
  });

  test("sorts, and Refresh and Back keep the view", async ({ page, context }) => {
    await mock(context, { rows: base(), requests: [] });
    await open(page);
    await expect(status(page)).toHaveText("Showing 5 of 5");
    expect((await places(page))[0]).toBe("Place 1");

    await control(page, "Sort").selectOption("oldest");
    await expect.poll(async () => (await places(page))[0]).toBe("Place 100");
    await control(page, "Sort").selectOption("highest");
    await expect.poll(async () => (await places(page))[0]).toBe("Place 2");
    await control(page, "Sort").selectOption("lowest");
    await expect.poll(async () => (await places(page))[0]).toBe("Place 3");
    await control(page, "Sort").selectOption("status");
    await expect.poll(async () => (await places(page)).at(-1)).toBe("Place 4");

    await control(page, "Source").selectOption("resident");
    await expect(status(page)).toHaveText("Showing 2 of 2");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(control(page, "Source")).toHaveValue("resident");
    await expect(control(page, "Sort")).toHaveValue("status");
    await expect(status(page)).toHaveText("Showing 2 of 2");

    await page.goBack();
    await expect(control(page, "Source")).toHaveValue("all");
    await expect(status(page)).toHaveText("Showing 5 of 5");
  });

  test("Load more goes 25 at a time and Refresh keeps the page", async ({ page, context }) => {
    await mock(context, { rows: manyRows(), requests: [] });
    await open(page);
    await expect(status(page)).toHaveText("Showing 25 of 30");
    await page.getByRole("button", { name: "Load more" }).click();
    await expect(status(page)).toHaveText("Showing 30 of 30");
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(status(page)).toHaveText("Showing 30 of 30");
  });

  test("details: thread and advisory for a community report, neither for a Quick Report", async ({ page, context }) => {
    await mock(context, { rows: base(), requests: [] });
    await open(page);
    await rowFor(page, "Place 1").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Place 1" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Post advisory" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /message/i }).first()).toBeVisible();
    await expect(page).toHaveURL(/report=community-1/);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page).not.toHaveURL(/report=/);

    await rowFor(page, "Place 3").click();
    await expect(dialog.getByText("From a guest")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Post advisory" })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: /^(Approve|Reject)/ })).toHaveCount(0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(dialog.getByText("From a guest")).toBeVisible();
    await page.goBack();
    await expect(dialog).toHaveCount(0);
  });

  test("empty and error states", async ({ page, context }) => {
    const state: State = { rows: [], requests: [] };
    await mock(context, state);
    await open(page);
    await expect(page.getByText("No reports in your barangay yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(0);
    state.fail = "permission denied for view all_reports";
    await control(page, "Status").selectOption("pending");
    await expect(page.getByRole("alert")).toContainText("permission denied for view all_reports");
    state.fail = undefined;
    state.rows = base();
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(status(page)).toHaveText("Showing 3 of 3");
  });

  test("the focus refresh keeps the search, filters and page", async ({ page, context }) => {
    const state: State = { rows: manyRows(), requests: [] };
    await mock(context, state);
    await open(page, "?source=resident&page=2");
    await expect(status(page)).toHaveText("Showing 30 of 30");
    state.rows = [row(99), ...manyRows()];
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(status(page)).toHaveText("Showing 31 of 31");
    await expect(control(page, "Source")).toHaveValue("resident");
    await expect(page).toHaveURL(/source=resident&page=2/);
  });

  test("the filters fit a phone", async ({ page, context }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await mock(context, { rows: base(), requests: [] });
    await open(page);
    await expect(status(page)).toHaveText("Showing 5 of 5");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});

import { expect, test, type BrowserContext } from "@playwright/test";
import { PopupQueue, catchUpReports, isPopupEvent, popupKey, type PopupReport } from "../../src/lib/reportPopups";

/*
 * Barangay officials verifying reports, the resident "Posted reports" feed and
 * the verified-report pop-ups, against a mocked Supabase. Realtime is not
 * mocked: the pop-up rules are tested directly through PopupQueue.
 */

test.describe.configure({ timeout: 90_000 });

const ID = "00000000-0000-4000-8000-000000000061";
const BARANGAY = "Tuburan";
const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const session = () => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: ID, email: "x@test.local", role: "authenticated", aud: "authenticated", exp })}.sig`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: "refresh",
    user: { id: ID, aud: "authenticated", role: "authenticated", email: "x@test.local", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
};

type Row = Record<string, unknown>;
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const report = (id: number, status: string, extra: Row = {}): Row => ({
  id, user_name: "Ana Reyes", user_id: "someone-else", location: `Purok ${id}`, lat: null, lng: null, water_level: "knee", description: "Water rising", photo_path: null,
  status, timestamp: minutesAgo(id * 10), rejection_reason: null, approval_reason: null, barangay: BARANGAY, ...extra,
});
const quick = (id: number, status: string, extra: Row = {}): Row => ({
  id, created_at: minutesAgo(id * 10), barangay: BARANGAY, landmark: `Landmark ${id}`, lat: null, lng: null, water_level: "waist", description: null, photo_path: null,
  reporter_name: "Ben", reporter_phone: null, status, rejection_reason: null, flagged_false: false, flag_reason: null, reviewed_by: null, reviewed_at: null, ...extra,
});

type Backend = { reports: Row[]; quick: Row[]; patches: Array<{ table: string; body: Row }>; refuse?: string };

async function mock(context: BrowserContext, role: "barangay" | "resident", seed: Partial<Backend> = {}) {
  const db: Backend = { reports: [], quick: [], patches: [], ...seed };
  await context.route(/supabase\.co/, (route) => route.abort());
  await context.route(/\/auth\/v1\/token/, (route) => route.fulfill({ json: session() }));
  await context.route(/\/auth\/v1\/user/, (route) => route.fulfill({ json: session().user }));
  await context.route(/\/rest\/v1\//, (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split("/rest/v1/")[1];
    const one = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const headers = { "content-range": "0-0/1", "access-control-expose-headers": "Content-Range" };
    if (req.method() === "HEAD") return route.fulfill({ status: 200, headers, body: "" });
    if (req.method() === "PATCH") {
      if (db.refuse) return route.fulfill({ status: 400, json: { message: db.refuse, code: "P0001" } });
      db.patches.push({ table, body: req.postDataJSON() as Row });
      const id = Number((url.searchParams.get("id") ?? "").replace("eq.", ""));
      const rows = table === "quick_reports" ? db.quick : db.reports;
      const row = rows.find((r) => r.id === id);
      if (row) Object.assign(row, req.postDataJSON());
      return route.fulfill({ json: row ? [row] : [] });
    }
    if (table === "profiles") {
      const row = { id: ID, role, name: "Test", email: "x@test.local", phone: "09170000000", barangay: BARANGAY };
      return route.fulfill({ json: one ? row : [row] });
    }
    if (table === "community_reports") {
      const wanted = url.searchParams.get("id");
      if (one && wanted) {
        const row = db.reports.find((r) => `eq.${r.id}` === wanted && r.status === "approved");
        return route.fulfill({ json: row ?? null });
      }
      const status = url.searchParams.get("status");
      const rows = status ? db.reports.filter((r) => `eq.${r.status}` === status) : db.reports;
      return route.fulfill({ json: rows, headers });
    }
    if (table === "quick_reports") return route.fulfill({ json: db.quick, headers });
    return route.fulfill({ json: one ? null : [], headers });
  });
  await context.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    "sb-dfzbthxumskpfygegoqf-auth-token",
    JSON.stringify(session()),
  ]);
  return db;
}

const tab = (page: import("@playwright/test").Page, name: RegExp) => page.getByRole("tab", { name });

test.describe("barangay verification", () => {
  test("Verify Reports lists pending first, approves without a note, and shows the badge", async ({ context, page }) => {
    const db = await mock(context, "barangay", { reports: [report(1, "rejected"), report(2, "approved"), report(3, "pending")] });
    await page.goto("/admin/barangay");
    await expect(tab(page, /Verify Reports\s*1 pending/)).toBeVisible();
    const headings = page.locator("[id^=report-] .font-bold");
    await expect(headings.first()).toHaveText("Purok 3");
    await page.locator("#report-3 button").first().click();
    await expect(page.locator("#report-3").getByText("By Ana Reyes")).toBeVisible();
    await page.locator("#report-3").getByRole("button", { name: "Approve" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
    await expect.poll(() => db.patches.length).toBe(1);
    expect(db.patches[0]).toEqual({ table: "community_reports", body: { status: "approved", approval_reason: null, rejection_reason: null } });
  });

  test("rejecting needs a reason and shows the database error", async ({ context, page }) => {
    await mock(context, "barangay", { reports: [report(3, "pending")], refuse: "Give a short reason for rejecting the report." });
    await page.goto("/admin/barangay");
    await page.locator("#report-3 button").first().click();
    await page.locator("#report-3").getByRole("button", { name: "Reject" }).click();
    const dialog = page.getByRole("dialog");
    const confirm = dialog.getByRole("button", { name: "Reject" });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole("combobox").selectOption({ index: 1 });
    await confirm.click();
    await expect(dialog.getByRole("alert")).toHaveText("Give a short reason for rejecting the report.");
  });

  test("Quick Reports: pending badge, approve, reject, and no MDRRMO-only actions", async ({ context, page }) => {
    const db = await mock(context, "barangay", { quick: [quick(1, "approved"), quick(2, "pending"), quick(3, "pending"), quick(4, "rejected", { flagged_false: true, flag_reason: "Prank" })] });
    await page.goto("/admin/barangay");
    await expect(tab(page, /Quick Reports\s*2 pending/)).toBeVisible();
    await tab(page, /Quick Reports/).first().click();
    await expect(page.locator("article").first()).toContainText("Landmark 2");
    await expect(page.getByRole("button", { name: /Flag as false/ })).toHaveCount(0);
    await expect(page.getByText(/Block device/)).toHaveCount(0);
    await expect(page.locator("#quick-report-4").getByRole("button")).toHaveCount(0);

    await page.locator("#quick-report-2").getByRole("button", { name: "Approve" }).click();
    await expect.poll(() => db.patches.length).toBe(1);
    expect(db.patches[0]).toEqual({ table: "quick_reports", body: { status: "approved" } });

    await page.locator("#quick-report-3").getByRole("button", { name: "Reject" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").selectOption({ index: 1 });
    await dialog.getByRole("button", { name: "Reject" }).click();
    await expect.poll(() => db.patches.length).toBe(2);
    expect(Object.keys(db.patches[1].body).sort()).toEqual(["rejection_reason", "status"]);
  });

  test("a refused Quick Report shows the database error on the card", async ({ context, page }) => {
    await mock(context, "barangay", { quick: [quick(2, "pending")], refuse: "permission denied for table quick_reports" });
    await page.goto("/admin/barangay");
    await tab(page, /Quick Reports/).first().click();
    await page.locator("#quick-report-2").getByRole("button", { name: "Approve" }).click();
    await expect(page.locator("#quick-report-2").getByRole("alert")).toHaveText("permission denied for table quick_reports");
  });
});

test.describe("Posted reports", () => {
  test("shows the exact empty text", async ({ context, page }) => {
    await mock(context, "resident");
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "Posted reports" })).toBeVisible();
    await expect(page.getByText("No verified reports in your barangay yet.")).toBeVisible();
  });

  test("hides the reporter's name and opens the full report", async ({ context, page }) => {
    await mock(context, "resident", { reports: [report(1, "approved"), report(2, "pending")] });
    await page.goto("/home");
    const section = page.locator("#posted-reports");
    await expect(section.getByText("Purok 1")).toBeVisible();
    await expect(section.getByText("Purok 2")).toHaveCount(0);
    await expect(section.getByText("Knee-deep")).toBeVisible();
    await expect(section.getByText(/^\d+ minutes ago$/)).toBeVisible();
    await expect(section.getByText("Reported by a resident of Tuburan")).toBeVisible();
    await expect(page.getByText("Ana Reyes")).toHaveCount(0);
    await section.getByRole("button").click();
    await expect(page).toHaveURL(/\/reports\/1$/);
    await expect(page.getByRole("heading", { name: "Purok 1" })).toBeVisible();
    await expect(page.getByText("Water rising")).toBeVisible();
    await expect(page.getByText("Ana Reyes")).toHaveCount(0);
  });
});

test.describe("catch-up pop-up", () => {
  const seen = (ids: number[]) => [
    [`last_seen_report_time:${ID}:${BARANGAY}`, String(Date.now() - 3_600_000)],
    [`shown_report_ids:${ID}:${BARANGAY}`, JSON.stringify(ids.map(String))],
  ];

  test("first launch saves and shows nothing", async ({ context, page }) => {
    await mock(context, "resident", { reports: [report(1, "approved")] });
    await page.goto("/home");
    await expect(page.locator("#posted-reports").getByText("Purok 1")).toBeVisible();
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), `last_seen_report_time:${ID}:${BARANGAY}`)).not.toBeNull();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto("/home");
    await expect(page.locator("#posted-reports").getByText("Purok 1")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("shows one dialog for reports approved while away, then not again", async ({ context, page }) => {
    await mock(context, "resident", { reports: [report(1, "approved"), report(2, "approved"), report(3, "approved")] });
    await context.addInitScript((entries) => {
      if (!localStorage.getItem("seeded")) {
        entries.forEach(([key, value]) => localStorage.setItem(key, value));
        localStorage.setItem("seeded", "1");
      }
    }, seen([3]));
    await page.goto("/home");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading")).toHaveText("2 new verified reports in Tuburan");
    await expect(dialog.getByText("Purok 1")).toBeVisible();
    await dialog.getByRole("button", { name: "Dismiss" }).click();
    await expect(dialog).toHaveCount(0);
    await page.goto("/home");
    await expect(page.locator("#posted-reports").getByText("Purok 1")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the resident's own rejected report shows its reason", async ({ context, page }) => {
    await mock(context, "resident", { reports: [report(1, "rejected", { user_id: ID, rejection_reason: "Photo is not of a flood" })] });
    await context.addInitScript((entries) => entries.forEach(([key, value]) => localStorage.setItem(key, value)), seen([]));
    await page.goto("/home");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading")).toHaveText("Your report was not accepted");
    await expect(dialog.getByText("Photo is not of a flood")).toBeVisible();
    await expect(dialog.getByRole("button", { name: /View/ })).toHaveCount(0);
  });

  test("never appears on the login page or for guests", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto("/conditions");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("pop-up rules", () => {
  const row = (id: number, extra: Partial<PopupReport> = {}): PopupReport => ({
    id, location: "x", water_level: "knee", timestamp: new Date().toISOString(), barangay: BARANGAY, user_id: "other", status: "approved", rejection_reason: null, ...extra,
  });
  const harness = (viewing?: number) => {
    const shown = new Set<string>();
    const dialogs: number[][] = [];
    const queue = new PopupQueue({
      isShown: (key) => shown.has(key),
      markShown: (keys) => keys.forEach((key) => shown.add(key)),
      isViewing: (id) => id === viewing,
      show: (reports) => dialogs.push(reports.map((r) => r.id)),
      windowMs: 20,
    });
    return { shown, dialogs, queue };
  };
  const wait = () => new Promise((resolve) => setTimeout(resolve, 50));

  test("groups events inside the window into one dialog", async () => {
    const { dialogs, queue } = harness();
    queue.add(row(1));
    queue.add(row(2));
    await wait();
    expect(dialogs).toEqual([[1, 2]]);
  });

  test("never shows an id twice", async () => {
    const { dialogs, queue } = harness();
    queue.add(row(1));
    await wait();
    queue.closed();
    queue.add(row(1));
    await wait();
    expect(dialogs.length).toBe(1);
  });

  test("skips the report being viewed but remembers it", async () => {
    const { dialogs, shown, queue } = harness(1);
    queue.add(row(1));
    await wait();
    expect(dialogs).toEqual([]);
    expect(shown.has("1")).toBe(true);
  });

  test("holds new events until the open dialog closes", async () => {
    const { dialogs, queue } = harness();
    queue.addCatchUp([row(1)]);
    queue.add(row(2));
    await wait();
    expect(dialogs.length).toBe(1);
    queue.closed();
    expect(dialogs[1]).toEqual([2]);
  });

  test("who gets a pop-up", () => {
    expect(isPopupEvent(row(1), BARANGAY, "me")).toBe(true);
    expect(isPopupEvent(row(2, { barangay: "Amatong" }), BARANGAY, "me")).toBe(false);
    expect(isPopupEvent(row(3, { barangay: "Amatong", user_id: "me" }), BARANGAY, "me")).toBe(true);
    expect(isPopupEvent(row(4, { status: "rejected" }), BARANGAY, "me")).toBe(false);
    expect(isPopupEvent(row(5, { status: "rejected", user_id: "me" }), BARANGAY, "me")).toBe(true);
    expect(isPopupEvent(row(6, { status: "pending", user_id: "me" }), BARANGAY, "me")).toBe(false);
  });

  test("catch-up counts late approvals, and the first launch shows nothing", () => {
    expect(catchUpReports([row(1)], null, new Set())).toBeNull();
    expect(catchUpReports([row(1), row(2)], 1, new Set(["1"]))?.map((r) => r.id)).toEqual([2]);
    expect(popupKey(row(1, { status: "rejected" }))).not.toBe(popupKey(row(1)));
  });
});

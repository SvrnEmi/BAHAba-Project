import { expect, test, type BrowserContext } from "@playwright/test";
import { PopupQueue, advisoryPopupKey, catchUpAdvisories, catchUpReports, isPopupEvent, popupKey, type PopupReport } from "../../src/lib/reportPopups";

/*
 * Barangay officials reading reports, the resident "Posted reports" feed and
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

const advisory = (id: number, reportId: number, extra: Row = {}): Row => ({
  id, report_id: reportId, barangay: BARANGAY, author_id: "official-2", author_role: "barangay", author_name: "Kap Reyes", body: `Advisory text ${id}`, created_at: minutesAgo(id), ...extra,
});

type Backend = { reports: Row[]; quick: Row[]; advisories: Row[]; messages: Row[]; posts: Array<{ table: string; body: Row }>; patches: Array<{ table: string; body: Row }>; refuse?: string };

async function mock(context: BrowserContext, role: "barangay" | "resident" | "mdrrmo", seed: Partial<Backend> = {}) {
  const db: Backend = { reports: [], quick: [], advisories: [], messages: [], posts: [], patches: [], ...seed };
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
    if (table === "report_advisories") {
      if (req.method() === "POST") {
        const body = req.postDataJSON() as Row;
        db.posts.push({ table, body });
        const row = advisory(900 + db.posts.length, Number(body.report_id), { author_id: ID, author_name: "Test", author_role: role, body: body.body, created_at: new Date().toISOString() });
        db.advisories.push(row);
        return route.fulfill({ status: 201, json: one ? row : [row] });
      }
      if (req.method() === "DELETE") {
        const id = Number((url.searchParams.get("id") ?? "").replace("eq.", ""));
        const row = db.advisories.find((a) => a.id === id);
        db.advisories = db.advisories.filter((a) => a.id !== id);
        return route.fulfill({ json: row ? [{ id }] : [] });
      }
      const wanted = (url.searchParams.get("report_id") ?? "").replace(/^in\.\(|\)$/g, "").split(",").map(Number);
      return route.fulfill({ json: db.advisories.filter((a) => wanted.includes(Number(a.report_id))), headers });
    }
    if (table === "report_messages") {
      if (req.method() === "POST") {
        const body = req.postDataJSON() as Row;
        db.posts.push({ table, body });
        const row = { id: 700 + db.posts.length, sender_role: role, body: body.body, created_at: new Date().toISOString() };
        return route.fulfill({ status: 201, json: one ? row : [row] });
      }
      return route.fulfill({ json: db.messages, headers });
    }
    if (table === "profiles") {
      const row = { id: ID, role, name: "Test", email: "x@test.local", phone: "09170000000", barangay: BARANGAY };
      return route.fulfill({ json: one ? row : [row] });
    }
    if (table === "community_reports") {
      const wanted = url.searchParams.get("id");
      if (one && wanted) {
        const row = db.reports.find((r) => `eq.${r.id}` === wanted && (r.status === "approved" || r.user_id === ID));
        return route.fulfill({ json: row ?? null });
      }
      const status = url.searchParams.get("status");
      const owner = url.searchParams.get("user_id");
      const either = url.searchParams.get("or");
      const rows = db.reports.filter((r) => (!status || `eq.${r.status}` === status) && (!owner || `eq.${r.user_id}` === owner) && (!wanted || `eq.${r.id}` === wanted) && (!either || r.status === "approved" || either.includes(`user_id.eq.${r.user_id}`)));
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

test.describe("barangay Reports page", () => {
  test("one badge counts pending community and Quick Reports, newest first", async ({ context, page }) => {
    await mock(context, "barangay", {
      reports: [report(1, "pending"), report(2, "approved"), report(3, "rejected", { rejection_reason: "Not a flood" })],
      quick: [quick(1, "pending"), quick(2, "pending", { flagged_false: true }), quick(3, "approved")],
    });
    await page.goto("/admin/barangay");
    await tab(page, /^Community reports$/).click();
    await expect(tab(page, /^Reports\s*2 pending/)).toBeVisible();
    await expect(page.getByText("Reports are verified by the MDRRMO. Your barangay can view them, comment and post advisories.")).toBeVisible();
    await expect(page.locator("[id^=report-] .font-bold").first()).toHaveText("Purok 1");
    await expect(page.locator("#report-1").getByText("Pending (waiting for MDRRMO)")).toBeVisible();
    await page.locator("#report-3 button").first().click();
    await expect(page.locator("#report-3").getByText("Not a flood")).toBeVisible();
    await tab(page, /^Quick reports$/).click();
    await expect(page.locator("article").first()).toContainText("Landmark 1");
  });

  test("Overview shows the barangay's numbers", async ({ context, page }) => {
    await mock(context, "barangay", { reports: [report(1, "pending")], quick: [quick(1, "approved")] });
    await page.goto("/admin/barangay");
    await tab(page, /^Overview$/).click();
    await expect(page.getByRole("heading", { name: "Overview of Tuburan" })).toBeVisible();
    await expect(page.getByText("Waiting for MDRRMO")).toBeVisible();
  });
});

test.describe("barangay officials cannot verify", () => {
  test("community reports have no approve or reject buttons and nothing is updated", async ({ context, page }) => {
    const db = await mock(context, "barangay", { reports: [report(1, "rejected"), report(2, "approved"), report(3, "pending")] });
    await page.goto("/admin/barangay");
    await tab(page, /^Community reports$/).click();
    await page.locator("#report-3 button").first().click();
    await expect(page.locator("#report-3").getByText("By Ana Reyes")).toBeVisible();
    await expect(page.getByRole("button", { name: /^(Approve|Reject)$/ })).toHaveCount(0);
    expect(db.patches).toEqual([]);
  });

  test("Quick Reports have no approve, reject, flag or block actions", async ({ context, page }) => {
    await mock(context, "barangay", { quick: [quick(1, "approved"), quick(2, "pending"), quick(4, "rejected", { flagged_false: true, flag_reason: "Prank" })] });
    await page.goto("/admin/barangay");
    await tab(page, /^Quick reports$/).click();
    await expect(page.locator("#quick-report-2")).toBeVisible();
    for (const id of [1, 2, 4]) await expect(page.locator(`#quick-report-${id}`).getByRole("button")).toHaveCount(0);
    await expect(page.getByText(/Flag as false|Block device/)).toHaveCount(0);
  });
});

test.describe("advisories for staff", () => {
  const open = async (page: import("@playwright/test").Page, id: number) => {
    await page.locator(`#report-${id} button`).first().click();
    return page.locator(`#report-${id}`);
  };

  test("a barangay official posts one, sending only report_id and body, and deletes only their own", async ({ context, page }) => {
    const db = await mock(context, "barangay", { reports: [report(1, "pending")], advisories: [advisory(5, 1)] });
    await page.goto("/admin/barangay");
    await tab(page, /^Community reports$/).click();
    const card = await open(page, 1);
    await expect(card.getByText("private, between you and the reporter, in the message thread.")).toBeVisible();
    await expect(card.getByText("public, shown on the posted report to residents once the report is verified.")).toBeVisible();
    await expect(card.getByText("Kap Reyes · Barangay")).toBeVisible();
    await expect(card.getByRole("button", { name: "Delete advisory" })).toHaveCount(0);

    const post = card.getByRole("button", { name: "Post advisory" });
    const box = card.getByLabel("Advisory text");
    await expect(post).toBeDisabled();
    await box.fill("ab");
    await expect(post).toBeDisabled();
    await expect(card.getByText(/2\/300/)).toBeVisible();
    await box.fill("  Avoid the bridge  ");
    await post.click();
    await expect.poll(() => db.posts.length).toBe(1);
    expect(db.posts[0]).toEqual({ table: "report_advisories", body: { report_id: 1, body: "Avoid the bridge" } });
    await expect(card.getByText("Avoid the bridge")).toBeVisible();
    await expect(box).toHaveValue("");

    page.on("dialog", (dialog) => void dialog.accept());
    await expect(card.getByRole("button", { name: "Delete advisory" })).toHaveCount(1);
    await card.getByRole("button", { name: "Delete advisory" }).click();
    await expect(card.getByText("Avoid the bridge")).toHaveCount(0);
    expect(db.advisories.map((a) => a.id)).toEqual([5]);
  });

  test("the private message thread still works for officials", async ({ context, page }) => {
    const db = await mock(context, "barangay", { reports: [report(1, "pending")] });
    await page.goto("/admin/barangay");
    await tab(page, /^Community reports$/).click();
    const card = await open(page, 1);
    await card.getByRole("button", { name: /^Messages/ }).click();
    await card.getByPlaceholder("Write a message").fill("Is the road passable?");
    await card.getByRole("button", { name: /^Send/ }).click();
    await expect.poll(() => db.posts.length).toBe(1);
    expect(db.posts[0]).toEqual({ table: "report_messages", body: { report_id: 1, body: "Is the road passable?" } });
  });

  test("the MDRRMO can post on any report and delete any advisory", async ({ context, page }) => {
    const db = await mock(context, "mdrrmo", { reports: [report(1, "pending")], advisories: [advisory(5, 1)] });
    await page.goto("/admin/mdrrmo");
    await page.getByRole("button", { name: "Dismiss", exact: true }).click().catch(() => undefined);
    await tab(page, /Verify Reports/).click();
    const card = await open(page, 1);
    await expect(card.getByRole("button", { name: "Approve" })).toBeVisible();
    await card.getByLabel("Advisory text").fill("Stay away from the river");
    await card.getByRole("button", { name: "Post advisory" }).click();
    await expect.poll(() => db.posts.length).toBe(1);
    page.on("dialog", (dialog) => void dialog.accept());
    await expect(card.getByRole("button", { name: "Delete advisory" })).toHaveCount(2);
    await card.getByRole("button", { name: "Delete advisory" }).last().click();
    await expect(card.getByText("Advisory text 5")).toHaveCount(0);
  });
});

test.describe("advisories for residents", () => {
  test("the feed and the full report show them with the author's name and time", async ({ context, page }) => {
    await mock(context, "resident", { reports: [report(1, "approved")], advisories: [advisory(5, 1)] });
    await page.goto("/home");
    const section = page.locator("#posted-reports");
    await expect(section.getByText("Advisory from Kap Reyes")).toBeVisible();
    await expect(section.getByText("Advisory text 5")).toBeVisible();
    await section.getByRole("button").first().click();
    await expect(page).toHaveURL(/\/reports\/1$/);
    await expect(page.getByText("Advisory from Kap Reyes")).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete advisory" })).toHaveCount(0);
  });

  test("the reporter sees them on their own pending report; other pending reports stay hidden", async ({ context, page }) => {
    await mock(context, "resident", { reports: [report(1, "pending", { user_id: ID }), report(2, "pending")], advisories: [advisory(5, 1)] });
    await page.goto("/reports/1");
    await expect(page.getByRole("heading", { name: "Purok 1" })).toBeVisible();
    await expect(page.getByText("This is your report. It is not posted to other residents.")).toBeVisible();
    await expect(page.getByText("Advisory from Kap Reyes")).toBeVisible();
    await page.goto("/reports/2");
    await expect(page.getByText("This report is no longer posted.")).toBeVisible();
  });
});

test.describe("advisory pop-up", () => {
  const seenAdvisories = (ids: number[]) => [
    [`last_seen_report_time:${ID}:advisories`, String(Date.now() - 3_600_000)],
    [`shown_report_ids:${ID}:advisories`, JSON.stringify(ids.map((id) => `advisory:${id}`))],
  ];
  const own = () => report(1, "pending", { user_id: ID });

  test("first launch saves and shows nothing", async ({ context, page }) => {
    await mock(context, "resident", { reports: [own()], advisories: [advisory(5, 1)] });
    await page.goto("/home");
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), `last_seen_report_time:${ID}:advisories`)).not.toBeNull();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("shows the exact title and text, opens the report, and shows once per advisory", async ({ context, page }) => {
    await mock(context, "resident", { reports: [own()], advisories: [advisory(5, 1)] });
    await context.addInitScript((entries) => {
      if (!localStorage.getItem("seeded")) {
        entries.forEach(([key, value]) => localStorage.setItem(key, value));
        localStorage.setItem("seeded", "1");
      }
    }, seenAdvisories([]));
    await page.goto("/home");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading")).toHaveText("Your barangay posted an advisory on your report");
    await expect(dialog.getByText("Advisory text 5")).toBeVisible();
    await dialog.getByRole("button", { name: "View report" }).click();
    await expect(page).toHaveURL(/\/reports\/1$/);
    await expect(page.getByRole("heading", { name: "Purok 1" })).toBeVisible();
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "Posted reports" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("an advisory on someone else's report never pops up", async ({ context, page }) => {
    await mock(context, "resident", { reports: [report(2, "approved")], advisories: [advisory(5, 2)] });
    await context.addInitScript((entries) => entries.forEach(([key, value]) => localStorage.setItem(key, value)), seenAdvisories([]));
    await page.goto("/home");
    await expect(page.locator("#posted-reports").getByText("Advisory from Kap Reyes")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("the rules: catch-up, grouped in the window, by report id when viewing", async () => {
    expect(catchUpAdvisories([{ id: 1 }], null, new Set())).toBeNull();
    expect(catchUpAdvisories([{ id: 1 }, { id: 2 }], 1, new Set(["advisory:1"]))).toEqual([{ id: 2 }]);

    const shown = new Set<string>();
    const dialogs: number[][] = [];
    const queue = new PopupQueue<{ id: number; report_id: number }>({
      keyOf: advisoryPopupKey,
      reportIdOf: (a) => a.report_id,
      isShown: (key) => shown.has(key),
      markShown: (keys) => keys.forEach((key) => shown.add(key)),
      isViewing: (id) => id === 9,
      show: (rows) => dialogs.push(rows.map((a) => a.id)),
      windowMs: 20,
    });
    queue.add({ id: 1, report_id: 1 });
    queue.add({ id: 2, report_id: 1 });
    queue.add({ id: 3, report_id: 9 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(dialogs).toEqual([[1, 2]]);
    expect(shown.has("advisory:3")).toBe(true);
  });

  test("never appears on the login page or for guests", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto("/conditions");
    await expect(page.getByRole("dialog")).toHaveCount(0);
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

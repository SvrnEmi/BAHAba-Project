import { copyFileSync, readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Download, type Page } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

/*
 * MDRRMO dashboard: alert end time, all clear and chips, flood event reports,
 * Emergency Contacts and Field Observations, against a mocked Supabase.
 */

test.describe.configure({ timeout: 90_000 });

const ID = "00000000-0000-4000-8000-000000000041";
const EMAIL = "mdrrmo@test.local";
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
const alertRow = (id: number, extra: Row): Row => ({
  id, level: "warning", title: `Alert ${id}`, message: "Body", target_barangay: "Tuburan", created_by: "x", status: "approved", source: "mdrrmo", channels: "push",
  sent_at: minutesAgo(id * 5), rejection_reason: null, withdrawn_reason: null, withdrawn_at: null, pagasa_color: "orange", pagasa_label: "Be Prepared", expires_at: null, is_all_clear: false, ...extra,
});

const event = (id: number, name: string, end: string) => ({ id, name, start_at: "2026-10-20T00:00:00Z", end_at: end });

const summary = {
  event: event(1, "Typhoon Test", "2026-10-21T00:00:00Z"),
  community_reports: { total: 7, by_status: { approved: 5, pending: 2 }, by_barangay: { Tuburan: 4, "Pato-o": 3 }, by_water_level: { knee: 6, waist: 1 } },
  quick_reports: { total: 3, by_status: { pending: 3 }, flagged_false: 1 },
  alerts: {
    total: 1,
    by_level: { critical: 1 },
    list: [{ sent_at: "2026-10-20T03:00:00Z", level: "critical", title: 'Evacuate, "now"', target: "Tuburan", status: "approved", source: "barangay", is_all_clear: false }],
  },
  field_observations: [{ observed_at: "2026-10-20T04:00:00Z", barangay: "Tuburan", kind: "waterway", location: "=Tuburan creek", status: "overflowing", note: "Over the banks" }],
};

const emptySummary = {
  ...summary,
  community_reports: { total: 0, by_status: {}, by_barangay: {}, by_water_level: {} },
  quick_reports: { total: 0, by_status: {}, flagged_false: 0 },
  alerts: { total: 0, by_level: {}, list: [] },
  field_observations: [],
};

type Backend = {
  alerts: Row[];
  activeIds: number[];
  events: Row[];
  contacts: Row[];
  observations: Row[];
  writes: { table: string; method: string; body: Row }[];
  reads: string[];
  rpc: { status?: number; json: unknown };
  refuse: Record<string, string>;
};

async function mock(context: BrowserContext, seed: Partial<Backend> = {}) {
  const db: Backend = { alerts: [], activeIds: [], events: [], contacts: [], observations: [], writes: [], reads: [], rpc: { json: summary }, refuse: {}, ...seed };
  let nextId = 2000;
  const tables: Record<string, Row[]> = { alerts: db.alerts, emergency_contacts: db.contacts, field_observations: db.observations };

  await context.route(/supabase\.co/, (route) => route.abort());
  await context.route(/\/auth\/v1\/token/, (route) => route.fulfill({ json: session() }));
  await context.route(/\/auth\/v1\/user/, (route) => route.fulfill({ json: session().user }));
  await context.route(/\/rest\/v1\//, (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const table = url.pathname.split("/rest/v1/")[1];
    const one = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
    const headers = { "content-range": "0-0/1", "access-control-expose-headers": "Content-Range" };
    if (table === "rpc/flood_event_summary") {
      db.writes.push({ table, method: "RPC", body: JSON.parse(req.postData() ?? "{}") as Row });
      return route.fulfill({ status: db.rpc.status ?? 200, json: db.rpc.json });
    }
    if (table.startsWith("rpc/")) return route.fulfill({ json: [] });
    if (req.method() === "HEAD") return route.fulfill({ status: 200, headers, body: "" });
    if (req.method() !== "GET") {
      const body = (req.postData() ? JSON.parse(req.postData()!) : {}) as Row;
      db.writes.push({ table, method: req.method(), body });
      if (db.refuse[table]) return route.fulfill({ status: 400, json: { message: db.refuse[table] } });
      const rows = tables[table] ?? [];
      const id = Number((url.searchParams.get("id") ?? "").replace("eq.", ""));
      if (req.method() === "POST") {
        const row = { id: nextId++, ...body };
        rows.unshift(row);
        return route.fulfill({ status: 201, json: one ? row : [row] });
      }
      const index = rows.findIndex((r) => r.id === id);
      if (index < 0) return route.fulfill({ json: [] });
      if (req.method() === "DELETE") return route.fulfill({ json: rows.splice(index, 1) });
      rows[index] = { ...rows[index], ...body };
      return route.fulfill({ json: [rows[index]] });
    }
    db.reads.push(decodeURIComponent(url.pathname + url.search));
    if (table === "profiles") {
      if (url.searchParams.get("select")?.startsWith("id")) return route.fulfill({ json: one ? null : [], headers });
      const row = { id: ID, role: "mdrrmo", name: "T", email: EMAIL, phone: "09170000000", barangay: "Tuburan" };
      return route.fulfill({ json: one ? row : [row] });
    }
    if (table === "active_alerts") return route.fulfill({ json: db.activeIds.map((id) => ({ id })), headers });
    if (table === "flood_events") return route.fulfill({ json: db.events, headers });
    if (table === "emergency_contacts") {
      const b = url.searchParams.get("barangay");
      const rows = db.contacts.filter((c) => (b === "is.null" ? c.barangay === null : b ? `eq.${c.barangay}` === b : true));
      return route.fulfill({ json: [...rows].sort((x, y) => Number(x.sort_order) - Number(y.sort_order)), headers });
    }
    if (table === "field_observations") {
      const b = url.searchParams.get("barangay");
      const k = url.searchParams.get("kind");
      return route.fulfill({ json: db.observations.filter((o) => (!b || `eq.${o.barangay}` === b) && (!k || `eq.${o.kind}` === k)), headers });
    }
    if (tables[table]) return route.fulfill({ json: tables[table], headers });
    return route.fulfill({ json: one ? null : [], headers });
  });
  return db;
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("your.email@example.com").fill(EMAIL);
  await page.getByPlaceholder("Enter your password").fill("password123");
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("**/admin/mdrrmo");
  await expect(page.getByRole("button", { name: /Broadcast Alert Now/ })).toBeVisible();
}

const openTab = (page: Page, name: RegExp) => page.getByRole("tab", { name }).click();

test.describe("Create Alert", () => {
  test("saves the end time, and stops a past custom time", async ({ page, context }) => {
    const db = await mock(context);
    await signIn(page);
    await page.getByPlaceholder("Enter detailed alert message for residents...").fill("Stay alert");

    await page.getByLabel("Alert ends").selectOption("custom");
    await page.getByRole("button", { name: /Broadcast Alert Now/ }).click();
    await expect(page.getByRole("alert")).toContainText("Choose the end date and time.");
    await page.getByLabel("End date and time").fill("2020-01-01T08:00");
    await page.getByRole("button", { name: /Broadcast Alert Now/ }).click();
    await expect(page.getByRole("alert")).toContainText("The end time must be in the future.");
    expect(db.writes.filter((w) => w.table === "alerts")).toHaveLength(0);

    await page.getByLabel("Alert ends").selectOption("3");
    const before = Date.now();
    await page.getByRole("button", { name: /Broadcast Alert Now/ }).click();
    await expect(page.getByText("Alert Sent Successfully!")).toBeVisible();
    const sent = db.writes.find((w) => w.table === "alerts")!.body;
    expect(sent.is_all_clear).toBe(false);
    expect(sent.target_barangay).toBe("All Barangays");
    const hours = (Date.parse(String(sent.expires_at)) - before) / 3_600_000;
    expect(hours).toBeGreaterThan(2.9);
    expect(hours).toBeLessThan(3.1);
    await expect(page.getByLabel("Alert ends")).toHaveValue("none");
  });

  test("All clear prefills, follows the target until edited, confirms and sends the flag", async ({ page, context }) => {
    const db = await mock(context);
    const dialogs: string[] = [];
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      void d.accept();
    });
    await signIn(page);

    await page.getByRole("button", { name: "All clear", exact: true }).click();
    const title = page.getByLabel("Title *");
    await expect(title).toHaveValue("ALL CLEAR: All Barangays");
    await expect(page.getByPlaceholder("Enter detailed alert message for residents...")).toHaveValue(/passed in all barangays/);
    await expect(page.getByLabel("PAGASA alert level *")).toHaveValue("advisory");
    await expect(page.getByLabel("PAGASA alert level *")).toBeDisabled();
    await expect(page.getByLabel("Alert ends")).toHaveValue("12");

    await page.getByRole("checkbox", { name: "All Barangays" }).uncheck();
    await page.getByLabel("Select individual barangays").selectOption(["Tuburan"]);
    await expect(title).toHaveValue("ALL CLEAR: Tuburan");

    await title.fill("ALL CLEAR: Tuburan river");
    await page.getByLabel("Select individual barangays").selectOption(["Amatong"]);
    await expect(title).toHaveValue("ALL CLEAR: Tuburan river");

    await page.getByRole("button", { name: /Broadcast Alert Now/ }).click();
    await expect(page.getByText("Alert Sent Successfully!")).toBeVisible();
    expect(dialogs[0]).toContain("from any source");
    const sent = db.writes.find((w) => w.table === "alerts")!.body;
    expect(sent).toMatchObject({ level: "advisory", is_all_clear: true, title: "ALL CLEAR: Tuburan river", target_barangay: "Amatong" });
    expect(Date.parse(String(sent.expires_at))).toBeGreaterThan(Date.now() + 11.9 * 3_600_000);
  });

  test("an all clear goes to one place; the All Clear template is a real all clear; other templates turn it off", async ({ page, context }) => {
    const db = await mock(context);
    await signIn(page);
    await page.getByRole("radio", { name: "All Clear" }).check();
    await expect(page.getByLabel("Title *")).toHaveValue("ALL CLEAR: All Barangays");

    await page.getByRole("checkbox", { name: "All Barangays" }).uncheck();
    await page.getByLabel("Select individual barangays").selectOption(["Tuburan", "Amatong"]);
    await page.getByRole("button", { name: /Broadcast Alert Now/ }).click();
    await expect(page.getByText("An all clear goes to one barangay or All Barangays.")).toBeVisible();
    expect(db.writes.filter((w) => w.table === "alerts")).toHaveLength(0);

    await page.getByRole("radio", { name: /Orange - Be Prepared/ }).check();
    await expect(page.getByLabel("Title *")).toHaveCount(0);
    await expect(page.getByLabel("PAGASA alert level *")).toBeEnabled();
  });

  test("status chips come from active_alerts across every target", async ({ page, context }) => {
    const db = await mock(context, {
      activeIds: [1],
      alerts: [
        alertRow(1, {}),
        alertRow(2, { expires_at: minutesAgo(1) }),
        alertRow(3, {}),
        alertRow(4, { status: "withdrawn", withdrawn_reason: "Sent by mistake" }),
      ],
    });
    await signIn(page);
    const chip = (id: number, label: string) => page.locator(`#alert-history-${id} .risk-badge`, { hasText: new RegExp(`^${label}$`) });
    await expect(chip(1, "Active")).toBeVisible();
    await expect(chip(2, "Ended")).toBeVisible();
    await expect(chip(3, "Cleared")).toBeVisible();
    await expect(chip(4, "Withdrawn")).toBeVisible();
    await expect(page.locator("#alert-history-4")).toContainText("Reason: Sent by mistake");
    expect(db.reads.some((r) => r.includes("active_alerts") && !r.includes("target_barangay"))).toBe(true);
  });

  test("republishing a withdrawn alert whose end has passed clears the end time", async ({ page, context }) => {
    const db = await mock(context, { alerts: [alertRow(1, { status: "withdrawn", withdrawn_reason: "Mistake", expires_at: minutesAgo(5) })] });
    page.on("dialog", (d) => void d.accept());
    await signIn(page);
    await page.locator("#alert-history-1 button").first().click();
    await page.locator("#alert-history-1").getByRole("button", { name: "Republish" }).click();
    await expect.poll(() => db.writes.find((w) => w.table === "alerts")?.body.expires_at).toBeNull();
  });
});

test.describe("Flood event report", () => {
  const download = async (page: Page, name: string, fn: () => Promise<void>): Promise<Download> => {
    const waiting = page.waitForEvent("download");
    await fn();
    const file = await waiting;
    expect(file.suggestedFilename()).toBe(name);
    return file;
  };
  const prepare = async (page: Page) => {
    await openTab(page, /Flood Events/);
    await page.getByRole("button", { name: "Download report for Typhoon Test" }).click();
    await expect(page.getByRole("button", { name: "PDF" })).toBeVisible();
  };

  test("builds a PDF and a zip of CSVs from one RPC call", async ({ page, context }) => {
    const db = await mock(context, { events: [event(1, "Typhoon Test", "2026-10-21T00:00:00Z")] });
    await signIn(page);
    await prepare(page);
    expect(db.writes.filter((w) => w.method === "RPC")).toEqual([{ table: "rpc/flood_event_summary", method: "RPC", body: { p_event_id: 1 } }]);
    await expect(page.getByText("This event is still ongoing.")).toHaveCount(0);

    const pdf = await download(page, "bahaba-flood-report-typhoon-test.pdf", () => page.getByRole("button", { name: "PDF" }).click());
    const pdfPath = await pdf.path();
    expect(readFileSync(pdfPath).subarray(0, 5).toString()).toBe("%PDF-");
    if (process.env.REPORT_OUT) copyFileSync(pdfPath, `${process.env.REPORT_OUT}/report.pdf`);

    const zip = await download(page, "bahaba-flood-report-typhoon-test.zip", () => page.getByRole("button", { name: "CSV files (zip)" }).click());
    const files = unzipSync(new Uint8Array(readFileSync(await zip.path())));
    expect(Object.keys(files).sort()).toEqual([
      "alerts.csv",
      "community-reports-by-barangay.csv",
      "community-reports-by-status.csv",
      "community-reports-by-water-level.csv",
      "field-observations.csv",
      "quick-reports-by-status.csv",
      "totals.csv",
    ]);
    const text = (name: string) => strFromU8(files[name]);
    expect(text("totals.csv")).toContain("Community reports,7");
    expect(text("totals.csv")).toContain("Quick Reports,3");
    expect(text("community-reports-by-barangay.csv")).toContain("Pato-o,3");
    expect(text("alerts.csv")).toContain('"Evacuate, ""now"""');
    expect(text("alerts.csv")).toContain("Red - Take Action");
    // A cell starting with = must not run as a spreadsheet formula.
    expect(text("field-observations.csv")).toContain("'=Tuburan creek");
    expect(text("field-observations.csv")).toContain("Overflowing");
  });

  test("empty sections say None recorded", async ({ page, context }) => {
    await mock(context, { events: [event(1, "Typhoon Test", "2026-10-21T00:00:00Z")], rpc: { json: emptySummary } });
    await signIn(page);
    await prepare(page);
    const pdf = await download(page, "bahaba-flood-report-typhoon-test.pdf", () => page.getByRole("button", { name: "PDF" }).click());
    if (process.env.REPORT_OUT) copyFileSync(await pdf.path(), `${process.env.REPORT_OUT}/report-empty.pdf`);
    const zip = await download(page, "bahaba-flood-report-typhoon-test.zip", () => page.getByRole("button", { name: "CSV files (zip)" }).click());
    const files = unzipSync(new Uint8Array(readFileSync(await zip.path())));
    for (const name of ["alerts.csv", "field-observations.csv", "community-reports-by-status.csv", "quick-reports-by-status.csv"]) {
      expect(strFromU8(files[name])).toContain("None recorded");
    }
  });

  test("a long report spans pages", async ({ page, context }) => {
    const list = Array.from({ length: 90 }, (_, i) => ({ ...summary.alerts.list[0], title: `Alert number ${i} with a fairly long title for wrapping`, sent_at: minutesAgo(i) }));
    const long = { ...summary, alerts: { ...summary.alerts, total: 90, list } };
    await mock(context, { events: [event(1, "Typhoon Test", "2026-10-21T00:00:00Z")], rpc: { json: long } });
    await signIn(page);
    await prepare(page);
    const pdf = await download(page, "bahaba-flood-report-typhoon-test.pdf", () => page.getByRole("button", { name: "PDF" }).click());
    const bytes = readFileSync(await pdf.path());
    expect(bytes.toString("latin1").match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(1);
    if (process.env.REPORT_OUT) copyFileSync(await pdf.path(), `${process.env.REPORT_OUT}/report-long.pdf`);
  });

  test("an ongoing event warns; the RPC's refusal is shown", async ({ page, context }) => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await mock(context, { events: [event(1, "Typhoon Test", future)], rpc: { status: 400, json: { message: "Not allowed." } } });
    await signIn(page);
    await openTab(page, /Flood Events/);
    await expect(page.getByText("This event is still ongoing.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Download report for Typhoon Test" }).click();
    await expect(page.getByRole("alert")).toContainText("Not allowed.");
    await expect(page.getByRole("button", { name: "PDF" })).toHaveCount(0);
  });
});

test.describe("Other pages", () => {
  const contact = (id: number, name: string, barangay: string | null, sort: number) => ({ id, barangay, name, role: null, phone: "0917 000 0000", sort_order: sort });

  test("Emergency Contacts: municipal first, filter by barangay, add, reorder, phone rule", async ({ page, context }) => {
    const db = await mock(context, { contacts: [contact(1, "Desk A", null, 0), contact(2, "Desk B", null, 1), contact(3, "Kagawad", "Tuburan", 0)] });
    await signIn(page);
    await openTab(page, /Emergency Contacts/);

    await expect(page.getByRole("heading", { name: "Municipal contacts (2)" })).toBeVisible();
    await expect(page.locator('[id^="contact-"]', { hasText: "Kagawad" })).toHaveCount(0);

    await page.getByLabel("Name").fill("Desk C");
    await page.getByLabel("Phone").fill("abc");
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByRole("alert")).toContainText("Enter a valid phone number");
    await page.getByLabel("Phone").fill("0917-000-0000");
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByText("Contact added.")).toBeVisible();
    expect(db.writes[0].body).toMatchObject({ barangay: null, name: "Desk C", sort_order: 2 });

    await page.getByRole("button", { name: "Move Desk B up" }).click();
    await expect.poll(() => page.locator('[id^="contact-"] p.font-bold').allInnerTexts()).toEqual(["Desk B", "Desk A", "Desk C"]);

    await page.getByLabel("Show contacts for").selectOption("Tuburan");
    await expect(page.getByRole("heading", { name: "Tuburan contacts (1)" })).toBeVisible();
    await expect(page.locator('[id^="contact-"] p.font-bold')).toHaveText(["Kagawad"]);
    await page.getByLabel("Name").fill("Captain");
    await page.getByLabel("Phone").fill("0917-000-0001");
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByText("Contact added.")).toBeVisible();
    expect(db.writes.at(-1)?.body).toMatchObject({ barangay: "Tuburan", name: "Captain", sort_order: 1 });
  });

  test("Field Observations: all barangays, filters, delete only", async ({ page, context }) => {
    const row = (id: number, barangay: string, kind: string, status: string, location: string) => ({ id, barangay, kind, location, status, note: null, observed_by: null, observed_at: minutesAgo(id * 10) });
    const db = await mock(context, { observations: [row(1, "Tuburan", "waterway", "rising", "Tuburan creek"), row(2, "Amatong", "road", "impassable", "Main road")] });
    page.on("dialog", (d) => void d.accept());
    await signIn(page);
    await openTab(page, /Field Observations/);

    const items = page.locator('li[id^="mdrrmo-observation-"]');
    await expect(items).toHaveCount(2);
    await expect(page.getByRole("button", { name: /Edit/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Post observation" })).toHaveCount(0);

    await page.getByRole("combobox", { name: "Kind" }).selectOption("road");
    await expect(items).toHaveCount(1);
    await expect(items).toContainText("Amatong");
    await page.getByRole("combobox", { name: "Kind" }).selectOption("");
    await page.getByRole("combobox", { name: "Barangay" }).selectOption("Tuburan");
    await expect(items).toHaveCount(1);
    await expect(items).toContainText("Tuburan creek");

    db.refuse.field_observations = "permission denied";
    await page.getByRole("button", { name: "Delete observation of Tuburan creek in Tuburan" }).click();
    await expect(page.getByRole("alert")).toContainText("permission denied");
    delete db.refuse.field_observations;
    await page.getByRole("button", { name: "Delete observation of Tuburan creek in Tuburan" }).click();
    await expect(items).toHaveCount(0);
  });
});

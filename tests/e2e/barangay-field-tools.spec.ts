import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/*
 * Barangay dashboard: Field Observations, Emergency Contacts and the alert end
 * time, all clear and status chips, against a mocked Supabase that stores rows.
 */

test.describe.configure({ timeout: 90_000 });

const ID = "00000000-0000-4000-8000-000000000031";
const EMAIL = "barangay@test.local";
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

const alertRow = (id: number, extra: Row): Row => ({
  id, level: "warning", title: `Alert ${id}`, message: "Body", target_barangay: BARANGAY, created_by: "Barangay Tuburan", status: "approved", source: "barangay",
  channels: "push", sent_at: minutesAgo(id * 5), rejection_reason: null, withdrawn_reason: null, withdrawn_at: null, pagasa_color: "orange", pagasa_label: "Be Prepared", expires_at: null, is_all_clear: false, ...extra,
});

type Backend = { observations: Row[]; contacts: Row[]; alerts: Row[]; activeIds: number[]; writes: { table: string; method: string; body: Row }[]; refuse: Record<string, string> };

async function mock(context: BrowserContext, seed: Partial<Backend> = {}) {
  const db: Backend = { observations: [], contacts: [], alerts: [], activeIds: [], writes: [], refuse: {}, ...seed };
  let nextId = 1000;
  const tables: Record<string, Row[]> = { field_observations: db.observations, emergency_contacts: db.contacts, alerts: db.alerts };

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

    if (req.method() === "POST" || req.method() === "PATCH" || req.method() === "DELETE") {
      const body = (req.postData() ? JSON.parse(req.postData()!) : {}) as Row;
      db.writes.push({ table, method: req.method(), body });
      if (db.refuse[table]) return route.fulfill({ status: 400, json: { message: db.refuse[table] } });
      const rows = tables[table] ?? [];
      const id = Number((url.searchParams.get("id") ?? "").replace("eq.", ""));
      if (req.method() === "POST") {
        const row = { id: nextId++, observed_at: new Date().toISOString(), sent_at: new Date().toISOString(), target_barangay: BARANGAY, status: "approved", source: "barangay", ...body };
        rows.unshift(row);
        return route.fulfill({ status: 201, json: one ? row : [row] });
      }
      const index = rows.findIndex((r) => r.id === id);
      if (index < 0) return route.fulfill({ json: [] });
      if (req.method() === "DELETE") return route.fulfill({ json: rows.splice(index, 1) });
      rows[index] = { ...rows[index], ...body };
      return route.fulfill({ json: [rows[index]] });
    }

    if (table === "profiles") {
      if (url.searchParams.get("select")?.startsWith("id")) return route.fulfill({ json: one ? null : [], headers });
      const row = { id: ID, role: "barangay", name: "T", email: EMAIL, phone: "09170000000", barangay: BARANGAY };
      return route.fulfill({ json: one ? row : [row] });
    }
    if (table === "active_alerts") return route.fulfill({ json: db.activeIds.map((id) => ({ id })), headers });
    if (table === "emergency_contacts") {
      return route.fulfill({ json: [...db.contacts].sort((a, b) => Number(a.sort_order) - Number(b.sort_order)), headers });
    }
    if (tables[table]) return route.fulfill({ json: tables[table], headers });
    return route.fulfill({ json: one ? null : [], headers });
  });
  return db;
}

async function open(page: Page, tab: RegExp) {
  await page.goto("/login");
  await page.getByPlaceholder("your.email@example.com").fill(EMAIL);
  await page.getByPlaceholder("Enter your password").fill("password123");
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("**/admin/barangay");
  await page.getByRole("tablist", { name: "Dashboard sections" }).getByRole("tab", { name: tab }).click();
}

test.describe("Field Observations", () => {
  test("empty state, status follows kind, posts with the fixed barangay", async ({ page, context }) => {
    const db = await mock(context);
    await open(page, /Field Observations/);
    await expect(page.getByText("No observations yet. Post what you see on the ground.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Barangay" })).toHaveValue(BARANGAY);

    const status = page.getByRole("combobox", { name: "Status" });
    await expect(status.locator("option")).toHaveText(["Normal", "Rising", "Overflowing"]);
    await status.selectOption("rising");
    await page.getByRole("combobox", { name: "Kind" }).selectOption("road");
    await expect(status.locator("option")).toHaveText(["Passable", "Impassable"]);
    await expect(status).toHaveValue("passable");

    await page.getByRole("button", { name: "Post observation" }).click();
    await expect(page.getByRole("alert")).toContainText("at least 2 characters");
    expect(db.writes).toHaveLength(0);

    await page.getByLabel("Location").fill("  Tuburan bridge  ");
    await page.getByLabel("Note (optional)").fill("Debris on the road");
    await page.getByRole("button", { name: "Post observation" }).click();
    await expect(page.getByText("Observation posted.")).toBeVisible();
    expect(db.writes[0].body).toEqual({ barangay: BARANGAY, kind: "road", location: "Tuburan bridge", status: "passable", note: "Debris on the road" });
    const card = page.locator("li", { hasText: "Tuburan bridge" });
    await expect(card.getByText("Passable", { exact: true })).toBeVisible();
  });

  test("newest first with times; Update status only on each location's latest; edit and delete", async ({ page, context }) => {
    const row = (id: number, location: string, status: string, m: number, kind = "waterway") => ({ id, barangay: BARANGAY, kind, location, status, note: null, observed_by: ID, observed_at: minutesAgo(m) });
    const db = await mock(context, { observations: [row(3, "Tuburan creek", "rising", 5), row(2, "tuburan creek", "normal", 120), row(1, "Main road", "passable", 240, "road")] });
    page.on("dialog", (d) => void d.accept());
    await open(page, /Field Observations/);

    await expect(page.locator('li[id^="observation-"]')).toHaveCount(3);
    const newest = page.locator("#observation-3");
    await expect(newest).toContainText("5 minutes ago");
    await expect(page.locator("#observation-2")).toContainText("2 hours ago");
    await expect(newest.getByText("Update status:")).toBeVisible();
    await expect(page.locator("#observation-2").getByText("Update status:")).toHaveCount(0);
    await expect(page.locator("#observation-1").getByRole("button", { name: "Update Main road to Impassable" })).toBeVisible();

    await newest.getByRole("button", { name: "Update Tuburan creek to Overflowing" }).click();
    await expect(page.getByText("Tuburan creek is now Overflowing.")).toBeVisible();
    expect(db.writes[0].method).toBe("POST");
    expect(db.writes[0].body).toMatchObject({ barangay: BARANGAY, kind: "waterway", location: "Tuburan creek", status: "overflowing" });
    await expect(page.locator('li[id^="observation-"]')).toHaveCount(4);

    await page.locator("#observation-1").getByRole("button", { name: "Edit observation of Main road" }).click();
    await expect(page.getByRole("heading", { name: "Edit observation" })).toBeVisible();
    await page.getByRole("combobox", { name: "Status" }).selectOption("impassable");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Observation updated.")).toBeVisible();
    await expect(page.locator("#observation-1").getByText("Impassable", { exact: true })).toBeVisible();

    await page.locator("#observation-1").getByRole("button", { name: "Delete observation of Main road" }).click();
    await expect(page.getByText("Observation deleted.")).toBeVisible();
    await expect(page.locator("#observation-1")).toHaveCount(0);
  });

  test("shows the database's own error", async ({ page, context }) => {
    await mock(context, { refuse: { field_observations: 'new row violates check constraint "obs_kind_status"' } });
    await open(page, /Field Observations/);
    await page.getByLabel("Location").fill("Tuburan creek");
    await page.getByRole("button", { name: "Post observation" }).click();
    await expect(page.getByRole("alert")).toContainText('new row violates check constraint "obs_kind_status"');
  });
});

test.describe("Create Alert", () => {
  test("sends expires_at as ISO and none of the server-set fields", async ({ page, context }) => {
    const db = await mock(context);
    await open(page, /Create Alert/);
    await page.getByLabel("Title").fill("Flood warning");
    await page.getByLabel("Message").fill("Stay alert");
    await page.getByLabel("Alert ends").selectOption("6");
    await page.getByRole("button", { name: "Publish alert" }).click();
    await expect(page.getByText("6 hours after publishing")).toBeVisible();
    const before = Date.now();
    await page.getByRole("alertdialog").getByRole("button", { name: "Publish alert" }).click();
    await expect(page.getByText("Published.", { exact: false })).toBeVisible();

    const body = db.writes[0].body;
    expect(Object.keys(body).sort()).toEqual(["channels", "expires_at", "is_all_clear", "level", "message", "title"]);
    expect(body.is_all_clear).toBe(false);
    expect(String(body.expires_at)).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    const hours = (Date.parse(String(body.expires_at)) - before) / 3_600_000;
    expect(hours).toBeGreaterThan(5.9);
    expect(hours).toBeLessThan(6.1);
  });

  test("Until withdrawn sends null; a past custom time is stopped; the database's refusal is shown", async ({ page, context }) => {
    const db = await mock(context);
    await open(page, /Create Alert/);
    await page.getByLabel("Title").fill("Flood warning");
    await page.getByLabel("Message").fill("Stay alert");

    await page.getByLabel("Alert ends").selectOption("custom");
    await page.getByRole("button", { name: "Publish alert" }).click();
    await expect(page.getByRole("alert")).toContainText("Choose the end date and time.");
    await page.getByLabel("End date and time").fill("2020-01-01T08:00");
    await page.getByRole("button", { name: "Publish alert" }).click();
    await expect(page.getByRole("alert")).toContainText("The end time must be in the future.");
    expect(db.writes).toHaveLength(0);

    await page.getByLabel("Alert ends").selectOption("none");
    await page.getByRole("button", { name: "Publish alert" }).click();
    await expect(page.getByText("Until withdrawn", { exact: false }).last()).toBeVisible();
    db.refuse.alerts = "The end time must be in the future.";
    await page.getByRole("alertdialog").getByRole("button", { name: "Publish alert" }).click();
    await expect(page.getByRole("alert")).toContainText("Unable to publish: The end time must be in the future.");
    expect(db.writes[0].body.expires_at).toBeNull();
  });

  test("All clear prefills, stays editable, warns, and sends the flag", async ({ page, context }) => {
    const db = await mock(context);
    await open(page, /Create Alert/);
    await page.getByRole("button", { name: "All clear" }).click();
    await expect(page.getByLabel("Title")).toHaveValue(`ALL CLEAR: ${BARANGAY}`);
    await expect(page.getByLabel("Message")).toHaveValue(/The flood danger has passed in Tuburan/);
    await expect(page.getByLabel("PAGASA level")).toHaveValue("advisory");
    await expect(page.getByLabel("PAGASA level")).toBeDisabled();
    await expect(page.getByLabel("Alert ends")).toHaveValue("12");

    await page.getByLabel("Message").fill("Edited all clear text");
    await page.getByRole("button", { name: "Publish alert" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("including MDRRMO and automatic warnings");
    await page.getByRole("alertdialog").getByRole("button", { name: "Publish alert" }).click();
    await expect(page.getByText("Published.", { exact: false })).toBeVisible();
    expect(db.writes[0].body).toMatchObject({ level: "advisory", is_all_clear: true, message: "Edited all clear text", title: `ALL CLEAR: ${BARANGAY}` });
    await expect(page.getByLabel("Title")).toHaveValue("");
    await expect(page.getByLabel("Alert ends")).toHaveValue("none");
  });

  test("choosing a template turns the all clear off", async ({ page, context }) => {
    const db = await mock(context);
    await open(page, /Create Alert/);
    await page.getByRole("button", { name: "All clear" }).click();
    await page.getByLabel("Use template").selectOption("warning-en");
    await expect(page.getByLabel("PAGASA level")).toBeEnabled();
    await page.getByRole("button", { name: "Publish alert" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Publish alert" }).click();
    await expect(page.getByText("Published.", { exact: false })).toBeVisible();
    expect(db.writes[0].body.is_all_clear).toBe(false);
  });

  test("status chips follow active_alerts, and a withdrawn alert shows its reason", async ({ page, context }) => {
    await mock(context, {
      activeIds: [1],
      alerts: [
        alertRow(1, {}),
        alertRow(2, { expires_at: minutesAgo(1) }),
        alertRow(3, {}),
        alertRow(4, { status: "withdrawn", withdrawn_reason: "Sent by mistake" }),
      ],
    });
    await open(page, /Create Alert/);
    const chip = (id: number, label: string) => page.locator(`#alert-${id} .risk-badge`, { hasText: new RegExp(`^${label}$`) });
    await expect(chip(1, "Active")).toBeVisible();
    await expect(chip(2, "Ended")).toBeVisible();
    await expect(chip(3, "Cleared")).toBeVisible();
    await expect(chip(4, "Withdrawn")).toBeVisible();
    await expect(page.locator("#alert-4")).toContainText("Reason: Sent by mistake");
  });
});

test.describe("Emergency Contacts", () => {
  const contact = (id: number, name: string, sort: number, barangay: string | null = BARANGAY) => ({ id, barangay, name, role: "Kagawad", phone: "0917 000 0000", sort_order: sort });

  test("validates the phone, adds with the fixed barangay, municipal stays read-only", async ({ page, context }) => {
    const db = await mock(context, { contacts: [contact(9, "MDRRMO desk", 0, null)] });
    await open(page, /Emergency Contacts/);

    const municipal = page.locator("section", { has: page.getByRole("heading", { name: "Municipal contacts" }) });
    await expect(municipal).toContainText("MDRRMO desk");
    await expect(municipal.getByRole("button")).toHaveCount(0);

    await page.getByLabel("Name").fill("Ana Reyes");
    for (const bad of ["12345", "0917-ABC-0000"]) {
      await page.getByLabel("Phone").fill(bad);
      await page.getByRole("button", { name: "Add contact" }).click();
      await expect(page.getByRole("alert")).toContainText("Enter a valid phone number");
    }
    expect(db.writes).toHaveLength(0);

    await page.getByLabel("Phone").fill("+63 (917) 000-0000");
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByText("Contact added.")).toBeVisible();
    expect(db.writes[0].body).toEqual({ barangay: BARANGAY, sort_order: 0, name: "Ana Reyes", role: null, phone: "+63 (917) 000-0000" });
  });

  test("reorders, edits and deletes, and shows the database's error", async ({ page, context }) => {
    const db = await mock(context, { contacts: [contact(1, "First", 0), contact(2, "Second", 0), contact(3, "Third", 0)] });
    page.on("dialog", (d) => void d.accept());
    await open(page, /Emergency Contacts/);

    const names = () => page.locator('[id^="contact-"] p.font-bold').allInnerTexts();
    await expect(page.getByRole("button", { name: "Move First up" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Move Third down" })).toBeDisabled();

    await page.getByRole("button", { name: "Move Second up" }).click();
    await expect.poll(names).toEqual(["Second", "First", "Third"]);
    expect(db.writes.every((w) => w.method === "PATCH" && Object.keys(w.body).join() === "sort_order")).toBe(true);

    await page.getByRole("button", { name: "Edit Third" }).click();
    await page.getByLabel("Role (optional)").fill("Captain");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator("#contact-3")).toContainText("Captain");

    db.refuse.emergency_contacts = "new row violates row-level security policy";
    await page.getByRole("button", { name: "Delete Third" }).click();
    await expect(page.getByRole("alert")).toContainText("new row violates row-level security policy");
    delete db.refuse.emergency_contacts;

    await page.getByRole("button", { name: "Delete Third" }).click();
    await expect(page.getByText("Contact deleted.")).toBeVisible();
    await expect(page.locator("#contact-3")).toHaveCount(0);
  });
});

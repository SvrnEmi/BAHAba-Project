import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/*
 * Report message threads against a mocked Supabase (auth + REST). The mock
 * report_messages table applies the server's rules: sender_role comes from
 * the session (never the request), a resident may send 3 in a row until
 * staff reply, other barangays see nothing (like RLS), only MDRRMO deletes.
 */

type Account = "resident" | "barangay" | "otherBarangay" | "mdrrmo";
const accounts: Record<Account, { id: string; email: string; role: "resident" | "barangay" | "mdrrmo"; barangay: string }> = {
  resident: { id: "00000000-0000-4000-8000-000000000011", email: "resident@test.local", role: "resident", barangay: "Poblacion" },
  barangay: { id: "00000000-0000-4000-8000-000000000012", email: "barangay@test.local", role: "barangay", barangay: "Poblacion" },
  otherBarangay: { id: "00000000-0000-4000-8000-000000000013", email: "other@test.local", role: "barangay", barangay: "Tabing Dagat" },
  mdrrmo: { id: "00000000-0000-4000-8000-000000000014", email: "mdrrmo@test.local", role: "mdrrmo", barangay: "Poblacion" },
};
test.describe.configure({ timeout: 90_000 });

const RATE_LIMIT = "Please wait for a reply before sending more messages.";
const BASE_REPORT = {
  id: 101,
  user_name: "Test resident",
  location: "Near the plaza",
  lat: null,
  lng: null,
  water_level: "knee",
  description: "Water rising",
  photo_path: null,
  status: "pending",
  timestamp: "2026-10-20T01:00:00Z",
  rejection_reason: null,
  admin_reply: null,
  admin_reply_at: null,
  barangay: "Poblacion",
};

type Row = { id: number; report_id: number; sender_id: string; sender_role: string; body: string; created_at: string };

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
function sessionFor(who: Account) {
  const { id, email } = accounts[who];
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: id, email, role: "authenticated", aud: "authenticated", exp })}.sig`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: `refresh-${who}`,
    user: { id, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
  };
}

/** One in-memory backend shared by every context in a test. */
function createBackend(reportOverrides: Partial<typeof BASE_REPORT> = {}) {
  const REPORT = { ...BASE_REPORT, ...reportOverrides };
  const messages: Row[] = [];
  const inserts: Array<Record<string, unknown>> = [];
  let seq = 0;
  let clock = Date.parse("2026-10-20T02:00:00Z");

  const whoFrom = (text: string) =>
    (Object.keys(accounts) as Account[]).find(
      (a) => text.includes(accounts[a].email) || text.includes(accounts[a].id) || text.includes(`refresh-${a}`),
    );
  const whoFromAuth = (header: string | undefined) =>
    whoFrom(header ? Buffer.from(header.split(".")[1] ?? "", "base64url").toString() : "");
  /** Like RLS: the resident (own report), its barangay's admin and MDRRMO. */
  const canSee = (who: Account | undefined) => !!who && (accounts[who].role === "mdrrmo" || accounts[who].barangay === REPORT.barangay);

  async function attach(context: BrowserContext) {
    await context.route(/\/auth\/v1\/token/, async (route) => {
      const who = whoFrom(route.request().postData() ?? "");
      return who ? route.fulfill({ json: sessionFor(who) }) : route.fulfill({ status: 400, json: { error: "invalid_grant" } });
    });
    await context.route(/\/auth\/v1\/user/, async (route) => {
      const who = whoFromAuth(route.request().headers()["authorization"]);
      return who ? route.fulfill({ json: sessionFor(who).user }) : route.fulfill({ status: 401, json: {} });
    });
    await context.route(/\/auth\/v1\/logout/, (route) => route.fulfill({ status: 204, body: "" }));
    await context.route(/\/realtime\/v1\//, (route) => route.abort());
    await context.route(/\/rest\/v1\//, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const table = url.pathname.split("/rest/v1/")[1];
      const who = whoFromAuth(req.headers()["authorization"]);
      const wantsObject = (req.headers()["accept"] ?? "").includes("vnd.pgrst.object");
      if (req.method() === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": "0-0/0" }, body: "" });

      if (table === "profiles") {
        const a = whoFrom(url.search);
        const row = a ? { id: accounts[a].id, role: accounts[a].role, name: a === "resident" ? REPORT.user_name : `Test ${a}`, email: accounts[a].email, phone: "09170000000", barangay: accounts[a].barangay } : null;
        return route.fulfill({ json: wantsObject ? row : row ? [row] : [] });
      }
      if (table === "community_reports") {
        return route.fulfill({ json: canSee(who) ? [REPORT] : [] });
      }
      if (table === "report_messages") {
        if (req.method() === "GET") {
          const rows = canSee(who) ? [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at)) : [];
          const desc = url.searchParams.get("order")?.includes("desc");
          return route.fulfill({ json: (desc ? rows.reverse() : rows).map(({ sender_id: _hidden, ...rest }) => rest) });
        }
        if (req.method() === "POST") {
          const payload = JSON.parse(req.postData() ?? "{}");
          inserts.push(payload);
          if (!who || !canSee(who)) return route.fulfill({ status: 403, json: { message: "permission denied" } });
          const role = accounts[who].role;
          const body = String(payload.body ?? "").trim();
          if (body.length < 1 || body.length > 1000) return route.fulfill({ status: 400, json: { message: "Message must be 1-1000 characters." } });
          if (role === "resident") {
            let run = 0;
            for (let i = messages.length - 1; i >= 0 && messages[i].sender_role === "resident"; i--) run++;
            if (run >= 3) return route.fulfill({ status: 400, json: { code: "P0001", message: RATE_LIMIT } });
          }
          clock += 60_000;
          const row: Row = { id: ++seq, report_id: payload.report_id, sender_id: accounts[who].id, sender_role: role, body, created_at: new Date(clock).toISOString() };
          messages.push(row);
          const { sender_id: _hidden, ...out } = row;
          return route.fulfill({ status: 201, json: wantsObject ? out : [out] });
        }
        if (req.method() === "DELETE") {
          if (!who || accounts[who].role !== "mdrrmo") return route.fulfill({ json: [] });
          const id = Number(url.searchParams.get("id")?.replace("eq.", ""));
          const index = messages.findIndex((m) => m.id === id);
          if (index >= 0) messages.splice(index, 1);
          return route.fulfill({ json: index >= 0 ? [{ id }] : [] });
        }
      }
      return route.fulfill({ json: wantsObject ? null : [] });
    });
  }

  return { messages, inserts, attach };
}

async function signIn(page: Page, who: Account) {
  await page.goto("/login");
  await page.getByPlaceholder("your.email@example.com").fill(accounts[who].email);
  await page.getByPlaceholder("Enter your password").fill("password123");
  await page.getByRole("button", { name: "Sign In" }).click();
}

async function openResidentThread(page: Page) {
  await signIn(page, "resident");
  await page.waitForURL("**/home");
  await page.goto("/profile?section=reports");
  await page.getByRole("button", { name: /^Messages/ }).click();
}

async function send(page: Page, text: string) {
  await page.getByLabel("Write a message").fill(text);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

test("resident: empty state, 3 messages send, the 4th is blocked with the server message", async ({ browser }) => {
  const backend = createBackend();
  const context = await browser.newContext();
  await backend.attach(context);
  const page = await context.newPage();
  await openResidentThread(page);

  await expect(page.getByText("No messages yet. Ask or update here.")).toBeVisible();
  const sendButton = page.getByRole("button", { name: "Send", exact: true });
  await expect(sendButton).toBeDisabled();
  await page.getByLabel("Write a message").fill("   ");
  await expect(sendButton).toBeDisabled();

  for (const text of ["First update", "Second update", "Third update"]) {
    await send(page, text);
    await expect(page.getByText(text, { exact: true })).toBeVisible();
  }
  await send(page, "Fourth update");
  await expect(page.getByRole("alert")).toHaveText(RATE_LIMIT);
  await expect(page.getByLabel("Write a message")).toHaveValue("Fourth update");
  expect(backend.messages).toHaveLength(3);
  // Only report_id and body are ever sent.
  for (const payload of backend.inserts) expect(Object.keys(payload).sort()).toEqual(["body", "report_id"]);

  // Counter appears near the limit.
  await page.getByLabel("Write a message").fill("a".repeat(850));
  await expect(page.getByText("850/1000")).toBeVisible();
  await context.close();
});

test("barangay admin of the same barangay replies; another barangay's admin cannot see the thread", async ({ browser }) => {
  const backend = createBackend();
  backend.messages.push({ id: 900, report_id: 101, sender_id: accounts.resident.id, sender_role: "resident", body: "Is help coming?", created_at: "2026-10-20T01:30:00Z" });

  const own = await browser.newContext();
  await backend.attach(own);
  const ownPage = await own.newPage();
  await signIn(ownPage, "barangay");
  await ownPage.waitForURL("**/admin/barangay");
  const card = ownPage.locator("#report-101");
  await expect(card.getByText("New", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: /^Messages/ }).click();
  await expect(card.getByText("Is help coming?")).toBeVisible();
  await expect(card.getByText("Resident", { exact: true })).toBeVisible();
  await expect(card.getByText("New", { exact: true })).toHaveCount(0);
  await card.getByLabel("Write a message").fill("Tanod is on the way.");
  await card.getByRole("button", { name: "Send", exact: true }).click();
  await expect(card.getByText("Tanod is on the way.")).toBeVisible();
  expect(backend.messages.at(-1)).toMatchObject({ sender_role: "barangay", body: "Tanod is on the way." });
  await expect(card.getByRole("button", { name: "Delete message" })).toHaveCount(0);
  await own.close();

  const other = await browser.newContext();
  await backend.attach(other);
  const otherPage = await other.newPage();
  await signIn(otherPage, "otherBarangay");
  await otherPage.waitForURL("**/admin/barangay");
  await expect(otherPage.getByText("No reports for Tabing Dagat yet")).toBeVisible();
  await expect(otherPage.locator("#report-101")).toHaveCount(0);
  await expect(otherPage.getByText("Is help coming?")).toHaveCount(0);
  await other.close();
});

test("resident sees the staff reply labelled Barangay, with a New dot", async ({ browser }) => {
  const backend = createBackend();
  backend.messages.push(
    { id: 1, report_id: 101, sender_id: accounts.resident.id, sender_role: "resident", body: "Is help coming?", created_at: "2026-10-20T01:30:00Z" },
    { id: 2, report_id: 101, sender_id: accounts.barangay.id, sender_role: "barangay", body: "Tanod is on the way.", created_at: "2026-10-20T01:40:00Z" },
  );
  const context = await browser.newContext();
  await backend.attach(context);
  const page = await context.newPage();
  await signIn(page, "resident");
  await page.waitForURL("**/home");
  await page.goto("/profile?section=reports");
  await expect(page.getByText("New", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Messages/ }).click();
  const thread = page.getByRole("list", { name: "Message thread" });
  await expect(thread.locator("li").nth(1)).toContainText("Barangay");
  await expect(thread.locator("li").nth(1)).toContainText("Tanod is on the way.");
  await expect(thread.locator("li").first()).toContainText("You");
  // Seen: the dot stays gone after a reload.
  await page.reload();
  await expect(page.getByRole("button", { name: /^Messages/ })).toBeVisible();
  await expect(page.getByText("New", { exact: true })).toHaveCount(0);
  await context.close();
});

test("MDRRMO sees the old reply first, replies, and deletes a message after confirming", async ({ browser }) => {
  const backend = createBackend({ admin_reply: "Earlier: team dispatched.", admin_reply_at: "2026-10-20T01:10:00Z" });
  backend.messages.push({ id: 5, report_id: 101, sender_id: accounts.resident.id, sender_role: "resident", body: "Spam message", created_at: "2026-10-20T01:30:00Z" });
  const context = await browser.newContext();
  await backend.attach(context);
  const page = await context.newPage();
  await signIn(page, "mdrrmo");
  await page.waitForURL("**/admin/mdrrmo");
  // A pending report opens the "Pending review" popup; it leads to the Reports tab.
  await page.getByRole("button", { name: "Review Reports" }).click();
  const card = page.locator("#report-101");
  await card.getByRole("button", { name: /^Messages/ }).click();

  const thread = card.getByRole("list", { name: "Message thread" });
  await expect(thread.locator("li").first()).toContainText("Earlier: team dispatched.");
  await expect(thread.locator("li").first()).toContainText("Earlier reply");

  await card.getByLabel("Write a message").fill("We are monitoring the area.");
  await card.getByRole("button", { name: "Send", exact: true }).click();
  await expect(card.getByText("We are monitoring the area.")).toBeVisible();
  expect(backend.messages.at(-1)).toMatchObject({ sender_role: "mdrrmo" });

  // Dismissing the confirmation keeps the message.
  page.once("dialog", (d) => void d.dismiss());
  await thread.locator("li", { hasText: "Spam message" }).getByRole("button", { name: "Delete message" }).click();
  await expect(card.getByText("Spam message")).toBeVisible();

  page.once("dialog", (d) => void d.accept());
  await thread.locator("li", { hasText: "Spam message" }).getByRole("button", { name: "Delete message" }).click();
  await expect(card.getByText("Spam message")).toHaveCount(0);
  expect(backend.messages.some((m) => m.body === "Spam message")).toBe(false);
  await context.close();
});

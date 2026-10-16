import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/*
 * Route-guard checks against a mocked Supabase (auth + REST), so they do not
 * depend on real accounts or backend state. The role each account gets comes
 * only from the mocked profiles table, like in production.
 */

type Role = "resident" | "barangay" | "mdrrmo";
const accounts: Record<Role, { id: string; email: string }> = {
  resident: { id: "00000000-0000-4000-8000-000000000001", email: "resident@test.local" },
  barangay: { id: "00000000-0000-4000-8000-000000000002", email: "barangay@test.local" },
  mdrrmo: { id: "00000000-0000-4000-8000-000000000003", email: "mdrrmo@test.local" },
};

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

function sessionFor(role: Role) {
  const { id, email } = accounts[role];
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  return {
    access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: id, email, role: "authenticated", aud: "authenticated", exp })}.sig`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: exp,
    refresh_token: `refresh-${role}`,
    user,
  };
}

/** Records every REST table the page queried, so tests can assert dashboards stayed idle. */
async function mockSupabase(context: BrowserContext) {
  const queriedTables: string[] = [];
  const roleOf = (text: string) =>
    (Object.keys(accounts) as Role[]).find((r) => text.includes(accounts[r].email) || text.includes(accounts[r].id) || text.includes(`refresh-${r}`));

  await context.route(/\/auth\/v1\/token/, async (route) => {
    const role = roleOf(route.request().postData() ?? "");
    if (!role) return route.fulfill({ status: 400, json: { error: "invalid_grant", error_description: "Invalid login credentials" } });
    return route.fulfill({ json: sessionFor(role) });
  });
  await context.route(/\/auth\/v1\/user/, async (route) => {
    const role = roleOf(route.request().headers()["authorization"] ? Buffer.from((route.request().headers()["authorization"].split(".")[1] ?? ""), "base64url").toString() : "");
    return role ? route.fulfill({ json: sessionFor(role).user }) : route.fulfill({ status: 401, json: {} });
  });
  await context.route(/\/auth\/v1\/logout/, (route) => route.fulfill({ status: 204, body: "" }));
  await context.route(/\/rest\/v1\//, async (route) => {
    const url = new URL(route.request().url());
    const table = url.pathname.split("/rest/v1/")[1];
    queriedTables.push(table);
    if (route.request().method() === "HEAD") return route.fulfill({ status: 200, headers: { "content-range": "0-0/0" }, body: "" });
    if (table === "profiles") {
      const role = roleOf(url.search);
      const row = role ? [{ id: accounts[role].id, role, name: `Test ${role}`, email: accounts[role].email, phone: "09170000000", barangay: "Poblacion" }] : [];
      return route.fulfill({ json: row });
    }
    return route.fulfill({ json: [] });
  });
  // No realtime server in tests.
  await context.route(/\/realtime\/v1\//, (route) => route.abort());
  return queriedTables;
}

async function login(page: Page, role: Role) {
  await page.getByPlaceholder("your.email@example.com").fill(accounts[role].email);
  await page.getByPlaceholder("Enter your password").fill("password123");
  await page.getByRole("button", { name: "Sign In" }).click();
}

/** Fails if `text` is ever painted while the page settles (catches a flash before redirect). */
async function neverShows(page: Page, text: string) {
  await page.addInitScript((needle) => {
    const w = window as unknown as { __forbidden?: boolean };
    new MutationObserver(() => {
      if (document.body?.innerText.includes(needle)) w.__forbidden = true;
    }).observe(document, { childList: true, subtree: true, characterData: true });
  }, text);
  return async () =>
    expect(await page.evaluate(() => (window as unknown as { __forbidden?: boolean }).__forbidden ?? false), `"${text}" was rendered`).toBe(false);
}

let queried: string[] = [];
test.beforeEach(async ({ context, page }) => {
  queried = await mockSupabase(context);
  page.on("dialog", (dialog) => void dialog.accept());
});

test.describe("route guards", () => {
  test("resident typing admin URLs lands on resident home, dashboards never render or query", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page, "resident");
    await expect(page).toHaveURL(/\/home$/);

    const check = await neverShows(page, "MDRRMO Admin Dashboard");
    queried.length = 0;
    await page.goto("/admin/mdrrmo", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await check();
    expect(queried).not.toContain("audit_logs");

    await page.goto("/admin/barangay", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByText("Barangay Management Dashboard")).toHaveCount(0);
  });

  test("barangay admin typing the MDRRMO or resident URLs lands on the barangay dashboard", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page, "barangay");
    await expect(page).toHaveURL(/\/admin\/barangay$/);
    await expect(page.getByText("Barangay Management Dashboard")).toBeVisible();

    const check = await neverShows(page, "MDRRMO Admin Dashboard");
    queried.length = 0;
    await page.goto("/admin/mdrrmo", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/admin\/barangay$/);
    await expect(page.getByText("Barangay Management Dashboard")).toBeVisible();
    await check();
    expect(queried).not.toContain("audit_logs");

    for (const path of ["/home", "/reports?openForm=true", "/map"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/admin\/barangay$/);
    }
  });

  test("MDRRMO admin cannot open resident or barangay pages", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page, "mdrrmo");
    await expect(page).toHaveURL(/\/admin\/mdrrmo$/);

    for (const path of ["/admin/barangay", "/reports?openForm=true", "/home", "/alerts", "/profile"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/admin\/mdrrmo$/);
    }
  });

  test("MDRRMO logs out from the dashboard header", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page, "mdrrmo");
    await expect(page).toHaveURL(/\/admin\/mdrrmo$/);
    await expect(page.getByRole("button", { name: "Open your profile" })).toHaveCount(0);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/admin/mdrrmo", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login$/);
  });

  test("refresh on a protected page stays there without showing login", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page, "resident");
    await expect(page).toHaveURL(/\/home$/);
    await page.goto("/alerts", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/alerts$/);

    const check = await neverShows(page, "Welcome Back");
    await page.reload();
    await expect(page).toHaveURL(/\/alerts$/);
    await page.waitForLoadState("networkidle");
    await check();
  });

  test("signed-out visitor opening / goes to login", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
  });

  test("session whose profile is missing is signed out to login with a notice, never given a role", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page, "resident");
    await expect(page).toHaveURL(/\/home$/);

    // The profile row disappears; the stored session is still valid.
    await page.route(/\/rest\/v1\/profiles/, (route) => route.fulfill({ json: [] }));
    const check = await neverShows(page, "Current Status");
    // Unload Home first so its in-flight queries are not counted.
    await page.goto("about:blank");
    queried.length = 0;
    await page.goto("/home", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("alert")).toContainText("couldn't load your account profile");
    await check();
    expect(queried.filter((t) => t !== "profiles")).toEqual([]);

    // Signed out for real: the session is not restored on reload.
    await page.goto("/alerts", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login$/);
  });

  test("logged-in user opening login / register / splash / unknown URL goes home", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page, "barangay");
    await expect(page).toHaveURL(/\/admin\/barangay$/);

    for (const path of ["/login", "/register", "/", "/admin", "/does-not-exist"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/admin\/barangay$/);
    }
  });

  test("signed-out deep link returns to that page after login when the role allows it", async ({ page }) => {
    await page.goto("/alerts", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login$/);
    await login(page, "resident");
    await expect(page).toHaveURL(/\/alerts$/);
  });

  test("signed-out deep link to another role's page goes to own home after login", async ({ page }) => {
    await page.goto("/admin/mdrrmo", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login$/);
    await login(page, "resident");
    await expect(page).toHaveURL(/\/home$/);
  });

  test("signed-out: protected and unknown URLs go to login without rendering the page", async ({ page }) => {
    const check = await neverShows(page, "Barangay Management Dashboard");
    for (const path of ["/home", "/admin/barangay", "/admin/mdrrmo", "/profile", "/reports?openForm=true", "/nope"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
    }
    await check();
    expect(queried.filter((t) => t !== "profiles")).toEqual([]);
  });

  test("logout clears the session; Back and typed URLs go to login", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page, "resident");
    await expect(page).toHaveURL(/\/home$/);

    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);

    for (const path of ["/home", "/profile", "/admin/mdrrmo"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/login$/);
    }

    // After an explicit logout the next login goes home, not back to /profile.
    await login(page, "resident");
    await expect(page).toHaveURL(/\/home$/);
  });

  test("signing out in another tab sends this tab to login", async ({ page, context }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page, "resident");
    await expect(page).toHaveURL(/\/home$/);

    const other = await context.newPage();
    other.on("dialog", (dialog) => void dialog.accept());
    await other.goto("/profile", { waitUntil: "domcontentloaded" });
    await other.getByRole("button", { name: "Log out" }).click();
    await expect(other).toHaveURL(/\/login$/);

    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
  });
});

test.describe("profile page", () => {
  test("opens from Home and survives a refresh", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page, "resident");
    await expect(page).toHaveURL(/\/home$/);

    await page.getByRole("button", { name: "Open your profile" }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByText("Test resident").first()).toBeVisible();
    await expect(page.getByText("Please sign in")).toHaveCount(0);

    await page.reload();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByText("Test resident").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
  });

  test("a failing auth-server user lookup does not claim the user is signed out", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page, "resident");
    await expect(page).toHaveURL(/\/home$/);

    await page.route(/\/auth\/v1\/user/, (route) => route.fulfill({ status: 500, json: { message: "Database error" } }));
    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Test resident").first()).toBeVisible();
    await expect(page.getByText("Please sign in")).toHaveCount(0);
  });

  test("profile query error shows a retry, keeps the header, and recovers", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page, "resident");
    await expect(page).toHaveURL(/\/home$/);

    // Fail the Profile page's row query only; the guard's role lookup still works.
    let failing = true;
    await page.route(/\/rest\/v1\/profiles\?select=name/, (route) =>
      failing ? route.fulfill({ status: 500, json: { message: "boom" } }) : route.fallback(),
    );
    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("alert")).toContainText("Could not load your profile");
    await expect(page.getByText("Please sign in")).toHaveCount(0);
    await expect(page.getByText("Resident").first()).toBeVisible();

    failing = false;
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("Test resident").first()).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
});

test.describe("MDRRMO settings", () => {
  test("only MDRRMO can open Settings", async ({ page }) => {
    await page.goto("/admin/mdrrmo/settings", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login$/);
    await login(page, "resident");
    await expect(page).toHaveURL(/\/home$/);
    await page.goto("/admin/mdrrmo/settings", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/home$/);
  });

  test("sections start collapsed, open one at a time, and load lazily", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page, "mdrrmo");
    await expect(page).toHaveURL(/\/admin\/mdrrmo$/);
    // Reload Settings directly so the dashboard's own queries are not counted.
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/admin\/mdrrmo\/settings$/);
    await page.goto("about:blank");
    queried.length = 0;
    await page.goto("/admin/mdrrmo/settings", { waitUntil: "domcontentloaded" });

    const header = (name: string) => page.getByRole("button", { name: new RegExp(`^${name}`) });
    const titles = ["Automation and risk rules", "Users and roles", "Notifications for admins", "Account", "System and demo tools"];
    for (const t of titles) await expect(header(t)).toHaveAttribute("aria-expanded", "false");

    await page.waitForLoadState("networkidle");
    expect(queried.some((t) => t.startsWith("risk_settings"))).toBe(false);

    await header("Automation and risk rules").click();
    await expect(header("Automation and risk rules")).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => queried.some((t) => t.startsWith("risk_settings"))).toBe(true);

    await header("Users and roles").click();
    await expect(header("Users and roles")).toHaveAttribute("aria-expanded", "true");
    await expect(header("Automation and risk rules")).toHaveAttribute("aria-expanded", "false");
  });

  test("risk rules: save is disabled until changed, validates, and writes the row", async ({ page }) => {
    const row = { auto_enabled: true, auto_publish_high: false, draft_alerts: true, medium_mm_3h: 30, high_mm_3h: 60, medium_mm_24h: 50, high_mm_24h: 100, override_hours: 6, holddown_hours: 3 };
    const writes: string[] = [];
    await page.route(/\/rest\/v1\/risk_settings/, (route) => {
      if (route.request().method() === "PATCH") {
        writes.push(route.request().postData() ?? "");
        return route.fulfill({ json: [{ id: 1 }] });
      }
      return route.fulfill({ json: [row] });
    });
    await page.route(/\/functions\/v1\/update-flood-risk/, (route) => route.fulfill({ json: { ok: true } }));
    page.removeAllListeners("dialog");
    const dialogs: string[] = [];
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      void d.accept();
    });

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await login(page, "mdrrmo");
    await expect(page).toHaveURL(/\/admin\/mdrrmo$/);
    await page.goto("/admin/mdrrmo/settings", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /^Automation and risk rules/ }).click();

    const save = page.getByRole("button", { name: "Save changes" });
    await expect(save).toBeDisabled();

    const highField = page.getByRole("spinbutton").nth(1); // HIGH, 3 h
    await highField.fill("20");
    await expect(page.getByText("MEDIUM must be lower than HIGH.")).toBeVisible();
    await expect(save).toBeDisabled();

    await highField.fill("100"); // +67%: needs confirmation
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText("Settings saved. Flood levels recalculated")).toBeVisible();
    expect(dialogs.some((m) => m.includes("more than 50%"))).toBe(true);
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0])).toMatchObject({ high_mm_3h: 100, medium_mm_3h: 30 });
    expect(queried).toContain("audit_logs");
    await expect(save).toBeDisabled();
  });
});

import { expect, test, type Page } from "@playwright/test";

const resident = { email: "johnmikecordero24@gmail.com", password: "qwerty12345" };
const mdrrmo = { email: "jmcordero0417@gmail.com", password: "qwerty12345" };
const barangay = { email: "bombaclatrasclat03@gmail.com", password: "qwerty12345" };
const runId = `TestSprite ${new Date().toISOString().replace(/[:.]/g, "-")}`;
const testAlertTitle = `${runId} Barangay Alert`;
const testReportDescription = `${runId} resident report`;

async function login(page: Page, account: { email: string; password: string }, path: string) {
  await page.goto("/login");
  await page.getByPlaceholder("your.email@example.com").fill(account.email);
  await page.getByPlaceholder("Enter your password").fill(account.password);
  await page.getByRole("button", { name: "Sign In" }).click({ force: true });
  await expect(page).toHaveURL(new RegExp(`${path.replace("/", "\\/")}$`), { timeout: 15_000 });
}

async function enableTestLocation(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 12.402627, longitude: 121.980853 } } as GeolocationPosition),
      },
    });
  });
}

function recordBrowserErrors(page: Page) {
  const consoleErrors: string[] = [];
  const requestFailures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    requestFailures.push(`${request.method()} ${request.url()} - ${request.failure()?.errorText ?? "unknown"}`);
  });
  return { consoleErrors, requestFailures };
}

test.describe.serial("BAHAba TestSprite acceptance suite", () => {
  test.afterEach(async ({ page }, testInfo) => {
    const errors = (page as Page & { bahabaErrors?: ReturnType<typeof recordBrowserErrors> }).bahabaErrors;
    if (errors) {
      await testInfo.attach("browser-errors.json", {
        body: JSON.stringify(errors, null, 2),
        contentType: "application/json",
      });
    }
  });

  test("AUTH-01 resident login redirects to /home", async ({ page }) => {
    (page as Page & { bahabaErrors?: ReturnType<typeof recordBrowserErrors> }).bahabaErrors = recordBrowserErrors(page);
    await login(page, resident, "/home");
  });

  test("AUTH-02 MDRRMO login redirects to /admin/mdrrmo", async ({ page }) => {
    (page as Page & { bahabaErrors?: ReturnType<typeof recordBrowserErrors> }).bahabaErrors = recordBrowserErrors(page);
    await login(page, mdrrmo, "/admin/mdrrmo");
  });

  test("AUTH-03 Barangay login redirects to /admin/barangay", async ({ page }) => {
    (page as Page & { bahabaErrors?: ReturnType<typeof recordBrowserErrors> }).bahabaErrors = recordBrowserErrors(page);
    await login(page, barangay, "/admin/barangay");
  });

  test("AUTH-04 invalid credentials show a friendly error", async ({ page }) => {
    (page as Page & { bahabaErrors?: ReturnType<typeof recordBrowserErrors> }).bahabaErrors = recordBrowserErrors(page);
    await page.goto("/login");
    await page.getByPlaceholder("your.email@example.com").fill("invalid@example.com");
    await page.getByPlaceholder("Enter your password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign In" }).click({ force: true });
    await expect(page.getByRole("alert")).toContainText("Incorrect email or password");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("RES-01 home shows the resident barangay flood risk", async ({ page }) => {
    await login(page, resident, "/home");
    await expect(page.getByText("Current Status")).toBeVisible();
    await expect(page.getByText(/Low Risk|Medium Risk|High Risk/)).toBeVisible({
      message: "Expected the Current Status card to show the resident's Barangay flood-risk level.",
    });
  });

  test("RES-02 map marker detail includes risk, water level, and GPS", async ({ page }) => {
    await login(page, resident, "/home");
    await page.goto("/map");
    await page.getByRole("button", { name: "View" }).first().click({ force: true });
    await expect(page.getByText("Flood Zone Details")).toBeVisible();
    await expect(page.getByText("Current Risk Level")).toBeVisible();
    await expect(page.getByText("Water Level")).toBeVisible();
    await expect(page.getByText("GPS Coordinates")).toBeVisible();
  });

  test("RES-03 alerts expose approved records only", async ({ page }) => {
    await login(page, resident, "/home");
    await page.goto("/alerts");
    await expect(page.getByText("Alerts").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("pending");
    await expect(page.locator("body")).not.toContainText("rejected");
  });

  test("BAR-01 Tuburan overview and water-level states persist", async ({ page }) => {
    await login(page, barangay, "/admin/barangay");
    await expect(page.getByRole("heading", { name: "Barangay Admin - Tuburan" })).toBeVisible();
    await expect(page.getByText("Barangay Residents")).toBeVisible();
    for (const level of ["Low Risk", "Medium Risk", "High Risk"]) {
      await page.getByRole("button", { name: level, exact: true }).click({ force: true });
      await expect(page.getByText(level, { exact: true }).first()).toBeVisible();
    }
  });

  test("BAR-02 barangay alert remains pending and private", async ({ page, browser }) => {
    await login(page, barangay, "/admin/barangay");
    await page.getByRole("button", { name: "Create Alert", exact: true }).click({ force: true });
    await page.getByPlaceholder("e.g., Flood Warning - Main Road").fill(testAlertTitle);
    await page.getByPlaceholder("Enter alert message for residents...").fill(`${runId} pending message`);
    await page.getByRole("button", { name: "Submit to MDRRMO" }).click({ force: true });
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: "My Alerts", exact: true }).click({ force: true });
    await expect(page.getByText(testAlertTitle)).toBeVisible();
    await expect(page.getByText("Pending MDRRMO Verification")).toBeVisible();

    const residentPage = await browser.newPage();
    await login(residentPage, resident, "/home");
    await residentPage.goto("/alerts");
    await expect(residentPage.locator("body")).not.toContainText(testAlertTitle);
    await residentPage.close();
  });

  test("RES-05 report with GPS is submitted as pending and shows approval dialog", async ({ page }) => {
    await enableTestLocation(page);
    await login(page, resident, "/home");
    await page.goto("/reports?openForm=true");
    await page.getByPlaceholder("Your current location").fill(`${runId} location`);
    await page.getByRole("button", { name: "Capture My GPS Location" }).click({ force: true });
    await expect(page.getByText(/12\.402627, 121\.980853/)).toBeVisible();
    await page.getByPlaceholder("Describe what you're observing...").fill(testReportDescription);
    let dialogMessage = "";
    page.once("dialog", async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });
    await page.getByRole("button", { name: "Submit", exact: true }).click({ force: true });
    await expect.poll(() => dialogMessage).toContain("Please wait for the MDRRMO");
    await expect(page.locator("body")).not.toContainText(testReportDescription);
  });

  test("RES-06 second report is blocked while the first is pending", async ({ page }) => {
    await enableTestLocation(page);
    await login(page, resident, "/home");
    await page.goto("/reports?openForm=true");
    await page.getByPlaceholder("Your current location").fill(`${runId} second location`);
    await page.getByRole("button", { name: "Capture My GPS Location" }).click({ force: true });
    await page.getByPlaceholder("Describe what you're observing...").fill(`${runId} duplicate report`);
    let dialogMessage = "";
    page.once("dialog", async (dialog) => {
      dialogMessage = dialog.message();
      await dialog.accept();
    });
    await page.getByRole("button", { name: "Submit", exact: true }).click({ force: true });
    await expect.poll(() => dialogMessage).toContain("already submitted");
  });

  test("MDR-01 system alert is approved and push-only", async ({ page }) => {
    await login(page, mdrrmo, "/admin/mdrrmo");
    await page.getByRole("button", { name: "Create System Alert", exact: true }).click({ force: true });
    await expect(page.getByText("Push Notification")).toBeVisible();
    await expect(page.getByText("SMS", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Facebook", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Twitter", { exact: true })).toHaveCount(0);
  });

  test("MDR-02 audit tab is available for moderation actions", async ({ page }) => {
    await login(page, mdrrmo, "/admin/mdrrmo");
    await page.getByRole("button", { name: "Audit Trail", exact: true }).click({ force: true });
    await expect(page.getByText("System Audit Trail & Message Traceability")).toBeVisible();
  });

  test("PERM-01 resident cannot successfully use admin mutations", async ({ page }) => {
    await login(page, resident, "/home");
    await page.goto("/admin/mdrrmo");
    // The route guard sends residents back to their own home.
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { name: "MDRRMO Admin Dashboard" })).toHaveCount(0);
  });

  test("PERM-02 barangay dashboard does not expose report moderation actions", async ({ page }) => {
    await login(page, barangay, "/admin/barangay");
    await page.getByRole("button", { name: "Community Reports", exact: true }).click({ force: true });
    await expect(page.getByRole("button", { name: "Verify", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reject", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete report", exact: true })).toHaveCount(0);
  });

  test("RES-04 report form requires GPS and description", async ({ page }) => {
    await login(page, resident, "/home");
    await page.goto("/reports?openForm=true");
    await expect(page.getByText("Submit Flood Report")).toBeVisible();
    await page.getByRole("button", { name: "Submit", exact: true }).click({ force: true });
    await expect(page.locator("body")).toContainText("Please capture GPS location before submitting");
    await expect(page.getByText(testReportDescription)).toHaveCount(0);
  });
});
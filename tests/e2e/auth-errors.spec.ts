import { expect, test, type Page } from "@playwright/test";

/* Registration and login error messages, against a mocked Supabase Auth. */

const EMAIL = "juan@test.local";
const ALREADY_REGISTERED = "This email is already registered. Please log in or reset your password.";
const RESET_SENT = "If this email is registered, a reset link has been sent.";

type Reply = { status?: number; json?: unknown; abort?: boolean };

async function mockAuth(page: Page, path: RegExp, reply: Reply) {
  await page.route(path, (route) =>
    reply.abort ? route.abort("internetdisconnected") : route.fulfill({ status: reply.status ?? 200, json: reply.json ?? {} }),
  );
}

async function submitRegister(page: Page) {
  await page.goto("/register");
  await page.locator('input[name="fullName"]').fill("Juan Dela Cruz");
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="phone"]').fill("09170000000");
  await page.locator('select[name="barangay"]').selectOption({ index: 1 });
  await page.locator('input[name="password"]').fill("password123");
  await page.locator('input[name="confirmPassword"]').fill("password123");
  await page.locator("#terms").check();
  await page.getByRole("button", { name: "Create Account" }).click();
}

const apiError = (status: number, code: string, msg: string) => ({ status, json: { code: status, error_code: code, msg } });
const placeholderUser = {
  id: "00000000-0000-4000-8000-000000000009",
  aud: "authenticated",
  role: "",
  email: EMAIL,
  app_metadata: {},
  user_metadata: {},
  identities: [],
  created_at: "2026-11-05T00:00:00Z",
};

test.describe("registration errors", () => {
  test("user_already_exists offers Log in with the email pre-filled", async ({ page }) => {
    await mockAuth(page, /\/auth\/v1\/signup/, apiError(422, "user_already_exists", "User already registered"));
    await submitRegister(page);
    await expect(page.getByRole("alert")).toContainText(ALREADY_REGISTERED);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('input[type="email"]')).toHaveValue(EMAIL);
  });

  test("the hidden duplicate (no error, no identities) is detected", async ({ page }) => {
    await mockAuth(page, /\/auth\/v1\/signup/, { json: placeholderUser });
    await submitRegister(page);
    await expect(page.getByRole("alert")).toContainText(ALREADY_REGISTERED);
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  });

  const cases: [string, Reply, string][] = [
    ["weak password", apiError(422, "weak_password", "Password is too weak"), "This password is too weak"],
    ["invalid email", apiError(400, "email_address_invalid", "Email address is invalid"), "Please enter a valid email address."],
    ["rate limit", apiError(429, "over_email_send_rate_limit", "email rate limit exceeded"), "Too many attempts. Please wait a few minutes."],
    ["no internet", { abort: true }, "No internet connection"],
    ["unknown error", apiError(400, "something_new", "Some new failure"), "Registration failed. Please try again."],
  ];
  for (const [name, reply, expected] of cases) {
    test(`${name} shows its own message`, async ({ page }) => {
      await mockAuth(page, /\/auth\/v1\/signup/, reply);
      await submitRegister(page);
      await expect(page.getByRole("alert")).toContainText(expected);
      await expect(page.getByRole("button", { name: "Log in" })).toHaveCount(0);
    });
  }
});

test.describe("login", () => {
  test("invalid_credentials shows the short message", async ({ page }) => {
    await mockAuth(page, /\/auth\/v1\/token/, apiError(400, "invalid_credentials", "Invalid login credentials"));
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill("wrong-password");
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page.getByRole("alert")).toHaveText("Wrong email or password.");
  });

  test("Forgot password sends the reset request and shows the neutral message", async ({ page }) => {
    let body: { email?: string } = {};
    await page.route(/\/auth\/v1\/recover/, (route) => {
      body = JSON.parse(route.request().postData() ?? "{}");
      return route.fulfill({ json: {} });
    });
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByRole("status")).toHaveText(RESET_SENT);
    expect(body.email).toBe(EMAIL);
  });

  test("Forgot password asks for the email first", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByRole("alert")).toHaveText("Please enter your email address first.");
  });

  test("a failed reset does not claim the link was sent", async ({ page }) => {
    await mockAuth(page, /\/auth\/v1\/recover/, apiError(429, "over_email_send_rate_limit", "email rate limit exceeded"));
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByRole("alert")).toHaveText("Too many attempts. Please wait a few minutes.");
    await expect(page.getByText(RESET_SENT)).toHaveCount(0);
  });
});

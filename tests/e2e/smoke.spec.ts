import { expect, test } from "@playwright/test";

test.describe("BAHAba smoke flows", () => {
  test("signed-out visitor opening / sees the Welcome page", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "BAHAba" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  });

  test("keeps sign-in disabled until required fields are filled", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill("resident@example.com");
    await expect(page.getByRole("button", { name: "Sign In" })).toBeDisabled();
  });

  test("sends signed-out visitors of protected pages to login", async ({ page }) => {
    for (const path of ["/home", "/admin/barangay", "/admin/mdrrmo", "/profile"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
      await expect(page.getByText("Current Status")).toHaveCount(0);
      await expect(page.getByText("Barangay Management Dashboard")).toHaveCount(0);
    }
  });

  test("sends unknown URLs to the Welcome page", async ({ page }) => {
    await page.goto("/no-such-page");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "BAHAba" })).toBeVisible();
  });
});

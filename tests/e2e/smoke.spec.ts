import { expect, test } from "@playwright/test";

test.describe("BAHAba smoke flows", () => {
  test("signed-out visitor opening / lands on login", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
  });

  test("keeps sign-in disabled until required fields are filled", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email").fill("resident@example.com");
    await expect(page.getByRole("button", { name: "Sign In" })).toBeDisabled();
  });

  test("sends signed-out visitors of protected pages to login", async ({ page }) => {
    for (const path of ["/home", "/admin/barangay", "/admin/mdrrmo", "/profile", "/no-such-page"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible();
      await expect(page.getByText("Current Status")).toHaveCount(0);
      await expect(page.getByText("Barangay Management Dashboard")).toHaveCount(0);
    }
  });
});

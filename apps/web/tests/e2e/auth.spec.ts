import { expect, test } from "@playwright/test";
import { extractLink, waitForEmail } from "./support/mailpit";
import { createOrganizer } from "./support/db";

test.describe("autentificare prin magic link (FR-008)", () => {
  test("linkul funcționează o singură dată", async ({ page }) => {
    const email = await createOrganizer();
    const since = new Date();
    await page.goto("/login");
    await page.getByLabel("Adresa de email").fill(email);
    await page.getByRole("button", { name: "Trimite linkul" }).click();
    await expect(page.getByRole("status")).toContainText("vei primi");

    const link = extractLink(await waitForEmail(email, { since }), "/auth/confirm");
    await page.goto(link);
    await expect(page).toHaveURL(/\/events$/);

    // A doua folosire a aceluiași link → mesaj clar și posibilitatea de a cere altul.
    await page.context().clearCookies();
    await page.goto(link);
    await expect(page).toHaveURL(/\/login\?error=link/);
    await expect(page.getByRole("alert").filter({ hasText: "a expirat sau a fost deja folosit" })).toBeVisible();
  });

  test("o adresă fără acces primește același mesaj ca una validă", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Adresa de email").fill(`nimeni-${Date.now()}@example.test`);
    await page.getByRole("button", { name: "Trimite linkul" }).click();
    await expect(page.getByRole("status")).toContainText("Dacă adresa are acces");
  });
});

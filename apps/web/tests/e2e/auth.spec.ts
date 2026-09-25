import { expect, test } from "@playwright/test";
import { createOrganizer, randomEmail } from "./support/db";
import { gotoHydrated } from "./support/page";
import { codeFromEmail } from "./support/self-service";

// Autentificarea cu cod și link (001/FR-008, înlocuit de 002: FR-007, FR-010, FR-011).
test.describe("autentificare cu cod și link", () => {
  test("linkul funcționează o singură dată, după apăsarea butonului", async ({ page }) => {
    const email = await createOrganizer();
    const since = new Date();
    await gotoHydrated(page, "/login");
    await page.getByLabel("Adresa de email").fill(email);
    await page.getByRole("button", { name: "Trimite codul" }).click();
    await expect(page).toHaveURL(/\/auth\/code\?request=/);

    const { link } = await codeFromEmail(email, since);
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Confirmă autentificarea" })).toBeVisible();
    await page.getByRole("button", { name: "Confirmă" }).click();
    await expect(page).toHaveURL(/\/events$/);

    // A doua folosire a aceluiași link → mesaj clar și posibilitatea de a cere altul.
    await page.context().clearCookies();
    await page.goto(link);
    await expect(page.getByRole("alert").filter({ hasText: "a expirat sau a fost deja folosit" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cere un email nou" })).toBeVisible();
  });

  test("o adresă fără cont primește aceeași pagină ca una validă", async ({ page }) => {
    const texts: string[] = [];
    for (const email of [await createOrganizer(), randomEmail("nimeni")]) {
      await gotoHydrated(page, "/login");
      await page.getByLabel("Adresa de email").fill(email);
      await page.getByRole("button", { name: "Trimite codul" }).click();
      await expect(page).toHaveURL(/\/auth\/code\?request=/);
      texts.push((await page.locator("main").innerText()).trim());
    }
    expect(texts[0]).toBe(texts[1]);
  });
});

import { expect, type Page } from "@playwright/test";
import { extractLink, waitForEmail } from "./mailpit";
import { gotoHydrated, waitForHydration } from "./page";

/** Autentificare prin magic link, citit din Mailpit (fără emailuri reale). */
export async function loginWithMagicLink(page: Page, email: string): Promise<void> {
  const since = new Date();
  await page.goto("/login");
  await page.getByLabel("Adresa de email").fill(email);
  await page.getByRole("button", { name: "Trimite linkul" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  await page.goto(extractLink(await waitForEmail(email, { since }), "/auth/confirm"));
  await waitForHydration(page);
}

export { gotoHydrated };

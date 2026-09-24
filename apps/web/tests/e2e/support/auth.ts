import { expect, type Page } from "@playwright/test";
import { TOTP } from "otpauth";
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

/** Admin nou: magic link + înrolare TOTP (secretul afișat ca text). Întoarce generatorul de coduri. */
export async function loginAsNewAdmin(page: Page, email: string): Promise<TOTP> {
  await loginWithMagicLink(page, email);
  await expect(page).toHaveURL(/\/auth\/mfa/);
  const secret = (await page.getByTestId("totp-secret").innerText()).replace(/\s/g, "");
  const totp = new TOTP({ secret });
  await page.getByLabel("Codul din aplicație").fill(totp.generate());
  await page.getByRole("button", { name: "Verifică" }).click();
  await expect(page).toHaveURL(/\/admin\/events$/);
  return totp;
}

export { gotoHydrated };

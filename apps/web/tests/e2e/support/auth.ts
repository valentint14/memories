import { expect, type Page } from "@playwright/test";
import { TOTP } from "otpauth";
import { gotoHydrated, waitForHydration } from "./page";
import { codeFromEmail, enterCode } from "./self-service";

/**
 * Autentificare cu codul din email, citit din Mailpit (002: FR-010; fără emailuri reale).
 * Numele e păstrat din 001 pentru testele existente.
 */
export async function loginWithMagicLink(page: Page, email: string): Promise<void> {
  const since = new Date();
  await gotoHydrated(page, "/login");
  await page.getByLabel("Adresa de email").fill(email);
  await page.getByRole("button", { name: "Trimite codul" }).click();
  await expect(page).toHaveURL(/\/auth\/code\?request=/);
  const { code } = await codeFromEmail(email, since);
  await waitForHydration(page);
  await enterCode(page, code);
  await expect(page).not.toHaveURL(/\/auth\/code/);
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

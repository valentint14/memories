import { expect, test, type Browser, type Page } from "@playwright/test";
import { loginWithMagicLink } from "./auth";
import { createOrganizer, serviceClient } from "./db";
import { waitForEmail } from "./mailpit";
import { gotoHydrated } from "./page";

/** Data de peste `days` zile, în formatul câmpului `date`. */
export function futureDate(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Completează și trimite formularul de pe pagina principală (002/US1). */
export async function submitCreateForm(page: Page, input: { email: string; name: string; date?: string }): Promise<void> {
  await gotoHydrated(page, "/");
  await page.getByLabel("Adresa de email").fill(input.email);
  await page.getByLabel("Numele evenimentului").fill(input.name);
  await page.getByLabel("Data evenimentului").fill(input.date ?? futureDate(30));
  await page.getByRole("checkbox", { name: /Accept termenii/ }).check();
  await page.getByRole("button", { name: "Creează evenimentul" }).click();
  await expect(page).toHaveURL(/\/auth\/code\?request=/);
}

/** Codul de 6 cifre din ultimul email trimis adresei după `since`. */
export async function codeFromEmail(email: string, since: Date): Promise<{ code: string; link: string }> {
  // Doar emailurile cu cod (confirmare sau autentificare); administratorii primesc și alte emailuri.
  const message = await waitForEmail(email, { since, subjectIncludes: "Memories" });
  const code = /\b(\d{6})\b/.exec(message.Subject)?.[1];
  const link = /(https?:\/\/\S+\/auth\/confirm\?\S+)/.exec(message.Text)?.[1];
  if (code === undefined || link === undefined) throw new Error("Emailul nu conține codul și linkul");
  return { code, link };
}

/** Introduce codul pe pagina deschisă `/auth/code`. */
export async function enterCode(page: Page, code: string): Promise<void> {
  const input = page.getByLabel("Codul din email");
  // React golește formularul la finalul fiecărei acțiuni; completarea se face pe câmpul gol.
  await expect(page.getByRole("button", { name: "Confirmă" })).toBeEnabled();
  await input.fill(code);
  await expect(input).toHaveValue(code);
  await page.getByRole("button", { name: "Confirmă" }).click();
}

/** Numărul de coduri greșite înregistrate pentru cererea din URL-ul paginii curente. */
export async function failedAttempts(page: Page): Promise<number> {
  const requestId = new URL(page.url()).searchParams.get("request") ?? "";
  const { data } = await serviceClient().from("auth_requests").select("failed_attempts").eq("id", requestId).maybeSingle();
  return data?.failed_attempts ?? -1;
}

/** Un eveniment în așteptarea activării, creat din contul unui organizator nou (context separat). */
export async function createAwaitingEvent(browser: Browser, name: string): Promise<string> {
  const context = await browser.newContext(test.info().project.use);
  const organizer = await context.newPage();
  try {
    await loginWithMagicLink(organizer, await createOrganizer());
    await gotoHydrated(organizer, "/events/new");
    await organizer.getByLabel("Numele evenimentului").fill(name);
    await organizer.getByLabel("Data evenimentului").fill(futureDate(20));
    await organizer.getByRole("checkbox", { name: /Accept termenii/ }).check();
    await organizer.getByRole("button", { name: "Creează evenimentul" }).click();
    await expect(organizer).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
    return organizer.url().split("/").pop() ?? "";
  } finally {
    await context.close();
  }
}

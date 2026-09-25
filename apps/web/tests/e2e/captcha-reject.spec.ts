import { expect, test } from "@playwright/test";
import { randomEmail, serviceClient } from "./support/db";
import { gotoHydrated, uniqueName } from "./support/page";
import { futureDate } from "./support/self-service";

// Verificarea anti-bot respinsă (002: FR-037, SC-007). Rulează în proiectul `captcha-reject`,
// pe un server cu secretul Turnstile care respinge orice token.
test("formularul respins de verificare nu creează nimic și nu trimite email", async ({ page }) => {
  const email = randomEmail("captcha");
  const name = uniqueName("Respins");
  await gotoHydrated(page, "/");
  await page.getByLabel("Adresa de email").fill(email);
  await page.getByLabel("Numele evenimentului").fill(name);
  await page.getByLabel("Data evenimentului").fill(futureDate(20));
  await page.getByRole("checkbox", { name: /Accept termenii/ }).check();
  await page.getByRole("button", { name: "Creează evenimentul" }).click();

  await expect(page.locator("form").getByRole("alert")).toContainText("Verificarea de securitate nu a reușit");
  await expect(page).toHaveURL(/\/$/);

  expect((await serviceClient().from("events").select("id").eq("name", name)).data ?? []).toHaveLength(0);
  expect((await serviceClient().from("auth_requests").select("id").eq("email", email)).data ?? []).toHaveLength(0);
  const mailpit = process.env.MAILPIT_URL ?? "http://localhost:54324";
  const res = await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  expect(((await res.json()) as { messages: unknown[] }).messages).toHaveLength(0);
});

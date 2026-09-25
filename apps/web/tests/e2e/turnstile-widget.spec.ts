import { expect, test } from "@playwright/test";
import { randomEmail, serviceClient } from "./support/db";
import { uniqueName } from "./support/page";
import { futureDate } from "./support/self-service";

// Widgetul Cloudflare Turnstile real (002: FR-037; research R3). Proiectul `turnstile-smoke` rulează
// fără TURNSTILE_OFFLINE, cu cheile de test Cloudflare, doar în CI sau cu E2E_TURNSTILE_SMOKE=1.
test("scriptul se încarcă cu nonce-ul CSP și produce un token acceptat de server", async ({ page }) => {
  const cspErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Content Security Policy")) cspErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.locator("html[data-hydrated='true']")).toBeAttached();
  // Widgetul invizibil scrie tokenul în câmpul ascuns după ce scriptul se încarcă.
  await expect(page.locator("input[name='cf-turnstile-response']")).toHaveValue(/.+/, { timeout: 30_000 });

  const email = randomEmail("turnstile");
  const name = uniqueName("Turnstile real");
  await page.getByLabel("Adresa de email").fill(email);
  await page.getByLabel("Numele evenimentului").fill(name);
  await page.getByLabel("Data evenimentului").fill(futureDate(20));
  await page.getByRole("checkbox", { name: /Accept termenii/ }).check();
  await page.getByRole("button", { name: "Creează evenimentul" }).click();
  await expect(page).toHaveURL(/\/auth\/code\?request=/);

  const { data } = await serviceClient().from("events").select("status").eq("name", name);
  expect(data).toEqual([{ status: "unconfirmed" }]);
  expect(cspErrors).toEqual([]);
});

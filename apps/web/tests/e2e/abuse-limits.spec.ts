import { expect, test } from "@playwright/test";
import { randomEmail, serviceClient } from "./support/db";
import { uniqueName } from "./support/page";
import { submitCreateForm } from "./support/self-service";

// Limitele de email (002: FR-036, SC-006). Rulează în proiectul `limits` (server cu limitele implicite).
test.describe.configure({ mode: "serial" });

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:54324";

async function mailCount(email: string): Promise<number> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  return ((await res.json()) as { messages: unknown[] }).messages.length;
}

async function settle(): Promise<void> {
  // Worker-ul procesează coada în câteva secunde; un email în plus ar apărea în acest interval.
  await new Promise((r) => setTimeout(r, 6_000));
}

test.beforeAll(async () => {
  // Rulările locale repetate pornesc de la zero.
  const { error } = await serviceClient().from("rate_limit_counters").delete().like("bucket_key", "authmail:%");
  if (error) throw error;
});

test("per adresă: a 4-a cerere în 15 minute nu mai trimite email, iar răspunsul e același", async ({ page }) => {
  const email = randomEmail("limit-addr");
  const texts: string[] = [];
  for (let i = 0; i < 4; i++) {
    await submitCreateForm(page, { email, name: uniqueName("Limită") });
    texts.push((await page.locator("main").innerText()).trim());
  }
  expect(new Set(texts).size).toBe(1);
  // Doar primele 3 cereri sunt înregistrate; fiecare o înlocuiește pe cea anterioară, iar worker-ul
  // trimite email doar pentru cererea încă valabilă, deci pleacă cel mult 3 emailuri.
  const requests = await serviceClient().from("auth_requests").select("id").eq("email", email);
  expect(requests.data ?? []).toHaveLength(3);
  await settle();
  const mails = await mailCount(email);
  expect(mails).toBeGreaterThanOrEqual(1);
  expect(mails).toBeLessThanOrEqual(3);
});

test("per IP: după 20 de cereri pe oră, următoarea nu creează cerere și nu trimite email", async ({ page }) => {
  // Testul anterior a folosit deja 4 din cele 20 de cereri ale IP-ului.
  for (let i = 0; i < 16; i++) {
    await submitCreateForm(page, { email: randomEmail("limit-ip"), name: uniqueName("IP") });
  }
  const blocked = randomEmail("limit-ip-blocked");
  const before = (await page.locator("main").innerText()).trim();
  await submitCreateForm(page, { email: blocked, name: uniqueName("IP") });
  expect((await page.locator("main").innerText()).trim()).toBe(before);

  const requests = await serviceClient().from("auth_requests").select("id").eq("email", blocked);
  expect(requests.data ?? []).toHaveLength(0);
  await settle();
  expect(await mailCount(blocked)).toBe(0);
});

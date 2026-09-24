import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loginWithMagicLink } from "./support/auth";
import { createEvent, createOrganizer, uploadAsGuest } from "./support/db";
import { uniqueName } from "./support/page";

// US7 — galeria se actualizează în timpul evenimentului (quickstart 9, SC-007). Necesită worker-ul.
test.describe.configure({ mode: "serial" });

let context: BrowserContext | undefined;
let page: Page;
let event: { id: string; token: string };

test.beforeAll(async ({ browser }) => {
  const email = await createOrganizer();
  event = await createEvent({ organizerEmail: email, name: uniqueName("Nunta live") });
  context = await browser.newContext(test.info().project.use);
  page = await context.newPage();
  await loginWithMagicLink(page, email);
});

test.afterAll(async () => {
  await context?.close();
});

test("o poză nouă apare în galeria deschisă în cel mult 10 secunde, fără reîncărcare (FR-033, SC-007)", async () => {
  await page.goto(`/events/${event.id}`);
  await expect(page.getByText("Încă nu s-a încărcat niciun fișier")).toBeVisible();
  // Canalul Realtime trebuie să fie abonat înainte de upload.
  await expect(page.locator("[data-live='subscribed']")).toBeAttached({ timeout: 15_000 });

  await uploadAsGuest(event.token, "android.jpg", "image/jpeg", "Ioana");
  const row = page.getByRole("row").filter({ hasText: "Ioana" });
  await expect(row).toBeVisible({ timeout: 10_000 });
  // După procesare, miniatura apare automat.
  await expect(row.locator("img")).toHaveAttribute("src", /token=/, { timeout: 30_000 });
  await expect(page.getByRole("status").filter({ hasText: "fișier nou" })).toBeAttached();
});

test("un video apare și devine gata fără reîncărcare (US7-2)", async () => {
  await uploadAsGuest(event.token, "clip.mp4", "video/mp4", "Radu");
  const row = page.getByRole("row").filter({ hasText: "Radu" });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row.locator("img")).toHaveAttribute("src", /poster\.webp/, { timeout: 60_000 });
  await expect(row.getByText("În procesare")).toHaveCount(0);
});

test("după o întrerupere, galeria recuperează fișierele apărute între timp, fără duplicate (US7-3)", async () => {
  await page.context().setOffline(true);
  await uploadAsGuest(event.token, "iphone.heic", "image/heic", "Offline1");
  await uploadAsGuest(event.token, "android.jpg", "image/jpeg", "Offline2");
  await page.waitForTimeout(3000);
  await page.context().setOffline(false);

  await expect(page.getByRole("row").filter({ hasText: "Offline1" })).toHaveCount(1, { timeout: 20_000 });
  await expect(page.getByRole("row").filter({ hasText: "Offline2" })).toHaveCount(1);
  await expect(page.getByRole("row")).toHaveCount(4);
});

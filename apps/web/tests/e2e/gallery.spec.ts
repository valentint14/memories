import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loginWithMagicLink } from "./support/auth";
import { createEvent, createOrganizer, uploadAsGuest, waitForProcessed } from "./support/db";
import { uniqueName } from "./support/page";

// US3 — organizatorul se autentifică și vede galeria (quickstart 9, 10, 12). Necesită worker-ul.
test.describe.configure({ mode: "serial" });

let page: Page;
let context: BrowserContext | undefined;
let eventA: { id: string; token: string };
let eventB: { id: string; token: string };
let nameA: string;
let nameB: string;

test.beforeAll(async ({ browser }) => {
  const emailA = await createOrganizer();
  const emailB = await createOrganizer();
  nameA = uniqueName("Nunta A");
  nameB = uniqueName("Nunta B");
  eventA = await createEvent({ organizerEmail: emailA, name: nameA });
  eventB = await createEvent({ organizerEmail: emailB, name: nameB });

  const ids: string[] = [];
  ids.push(await uploadAsGuest(eventA.token, "android.jpg", "image/jpeg", "Maria"));
  ids.push(await uploadAsGuest(eventA.token, "iphone.heic", "image/heic"));
  ids.push(await uploadAsGuest(eventA.token, "iphone-hevc.mov", "video/quicktime", "Dan"));
  ids.push(await uploadAsGuest(eventB.token, "clip.mp4", "video/mp4"));
  await waitForProcessed(ids);

  // O singură autentificare per profil de browser; testele folosesc aceeași sesiune.
  context = await browser.newContext(test.info().project.use);
  page = await context.newPage();
  await loginWithMagicLink(page, emailA);
});

test.afterAll(async () => {
  await context?.close();
});

test("organizatorul vede doar evenimentele sale (FR-009)", async () => {
  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByRole("link", { name: nameA })).toBeVisible();
  await expect(page.getByText(nameB)).toHaveCount(0);
});

test("galeria arată miniaturile în ordine cronologică, cu numele invitaților (FR-027)", async () => {
  await page.goto(`/events/${eventA.id}`);
  await expect(page.getByRole("heading", { name: nameA })).toBeVisible();

  const items = page.getByRole("row");
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText("Maria");
  await expect(items.nth(1)).toContainText("Invitat anonim");
  await expect(items.nth(2)).toContainText("Dan");

  // Miniaturile se încarcă din URL-uri semnate.
  const thumb = items.nth(1).locator("img");
  await expect(thumb).toHaveAttribute("src", /token=/);
  await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test("o poză HEIC se deschide la dimensiune completă, iar video-ul are versiunea de redare (FR-024, FR-028)", async () => {
  await page.goto(`/events/${eventA.id}`);
  await page.getByRole("row").nth(1).click();
  const dialog = page.getByRole("dialog");
  const full = dialog.locator("img");
  await expect(full).toHaveAttribute("src", /display\.webp/);
  await expect.poll(() => full.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(400);

  await dialog.getByRole("button", { name: "Următorul" }).click();
  const video = dialog.locator("video");
  await expect(video).toHaveAttribute("src", /playback\.mp4/);
  await expect(video).toHaveAttribute("poster", /poster\.webp/);
  // Chromium din Playwright nu are codecul H.264; redarea efectivă se verifică pe browsere reale
  // (quickstart 10), iar codecul în testul worker-ului (ffprobe).
});

test("accesul direct la evenimentul altui organizator e refuzat (FR-009, SC-012)", async () => {
  const response = await page.goto(`/events/${eventB.id}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByText(nameB)).toHaveCount(0);
});

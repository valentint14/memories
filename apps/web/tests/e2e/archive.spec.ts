import { readFile } from "node:fs/promises";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loginWithMagicLink } from "./support/auth";
import { createEvent, createOrganizer, serviceClient, uploadAsGuest, waitForProcessed } from "./support/db";
import { uniqueName } from "./support/page";

// US4 — descărcarea fișierelor (quickstart 14). Necesită worker-ul.
test.describe.configure({ mode: "serial" });

let context: BrowserContext | undefined;
let page: Page;
let eventId: string;
let emptyEventId: string;

function countZipEntries(zip: Buffer): number {
  let count = 0;
  let offset = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  while (offset !== -1) {
    count += 1;
    offset = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), offset + 4);
  }
  return count;
}

test.beforeAll(async ({ browser }) => {
  const email = await createOrganizer();
  const event = await createEvent({ organizerEmail: email, name: uniqueName("Nunta arhivă") });
  const empty = await createEvent({ organizerEmail: email, name: uniqueName("Eveniment gol") });
  eventId = event.id;
  emptyEventId = empty.id;
  const ids = [
    await uploadAsGuest(event.token, "android.jpg", "image/jpeg", "Ana"),
    await uploadAsGuest(event.token, "iphone.heic", "image/heic"),
    await uploadAsGuest(event.token, "clip.mp4", "video/mp4"),
  ];
  await waitForProcessed(ids);

  // Un fișier încărcat, dar încă neprocesat: nu intră în arhivă și e anunțat (FR-030).
  const { data: session } = await serviceClient().from("guest_sessions").insert({ event_id: event.id }).select("id").single();
  await serviceClient().from("media_items").insert({
    event_id: event.id,
    guest_session_id: session?.id ?? "",
    kind: "photo",
    declared_mime: "image/jpeg",
    original_filename: "in-procesare.jpg",
    declared_bytes: 10,
    incoming_path: `${event.id}/in-procesare`,
    status: "processing",
    uploaded_at: new Date().toISOString(),
  });

  context = await browser.newContext({ ...test.info().project.use, acceptDownloads: true });
  page = await context.newPage();
  await loginWithMagicLink(page, email);
});

test.afterAll(async () => {
  await context?.close();
});

test("descarcă un fișier la calitatea originală (FR-029)", async () => {
  await page.goto(`/events/${eventId}`);
  await page.getByRole("row").first().click();
  // Se verifică răspunsul linkului semnat, nu evenimentul de download al browserului: WebKit pe
  // Linux (emulare iPhone) nu emite evenimentul pentru un link cross-origin cu `attachment`.
  const href = await page.getByRole("link", { name: "Descarcă originalul" }).getAttribute("href");
  expect(href).toContain("token=");
  const response = await page.request.get(href ?? "");
  expect(response.status()).toBe(200);
  const disposition = response.headers()["content-disposition"] ?? "";
  expect(disposition).toContain("attachment");
  expect(decodeURIComponent(disposition)).toMatch(/\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_Ana_[0-9a-f]{8}\.jpg/);
  const bytes = await response.body();
  expect(bytes.subarray(0, 2).toString("hex")).toBe("ffd8");
});

test("pregătește arhiva, anunță când e gata și o descarcă (FR-030, SC-010)", async () => {
  await page.goto(`/events/${eventId}`);
  await page.getByRole("button", { name: "Descarcă tot" }).click();
  await expect(page.getByText("Se pregătește arhiva")).toBeVisible();

  const link = page.getByRole("link", { name: /Descarcă arhiva/ });
  await expect(link).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("1 fișier nu este inclus (în procesare sau neprocesabil).")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await link.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  expect(countZipEntries(await readFile(await download.path()))).toBe(3);
});

test("pentru un eveniment fără fișiere, descărcarea în masă e indisponibilă (US4-3)", async () => {
  await page.goto(`/events/${emptyEventId}`);
  await expect(page.getByRole("button", { name: "Descarcă tot" })).toBeDisabled();
  await expect(page.getByText("Nu există încă fișiere de descărcat.")).toBeVisible();
});

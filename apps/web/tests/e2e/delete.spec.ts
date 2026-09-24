import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loginWithMagicLink } from "./support/auth";
import { createEvent, createOrganizer, serviceClient, uploadAsGuest, waitForProcessed } from "./support/db";
import { uniqueName } from "./support/page";

// US5 — organizatorul șterge fișiere (quickstart 13, SC-011). Necesită worker-ul.
test.describe.configure({ mode: "serial" });

let context: BrowserContext | undefined;
let page: Page;
let eventId: string;

test.beforeAll(async ({ browser }) => {
  const email = await createOrganizer();
  const event = await createEvent({ organizerEmail: email, name: uniqueName("Nunta ștergere") });
  eventId = event.id;
  const ids = [
    await uploadAsGuest(event.token, "android.jpg", "image/jpeg", "Ana"),
    await uploadAsGuest(event.token, "iphone.heic", "image/heic", "Bogdan"),
    await uploadAsGuest(event.token, "clip.mp4", "video/mp4", "Cristi"),
  ];
  await waitForProcessed(ids);
  // O arhivă existentă trebuie invalidată de ștergere.
  await serviceClient()
    .from("archive_jobs")
    .insert({ event_id: eventId, status: "ready", archive_path: `${eventId}/vechi.zip`, expires_at: new Date(Date.now() + 86_400_000).toISOString() });

  context = await browser.newContext(test.info().project.use);
  page = await context.newPage();
  await loginWithMagicLink(page, email);
});

test.afterAll(async () => {
  await context?.close();
});

test("șterge definitiv fișierele selectate, după confirmare (FR-031, FR-032, SC-011)", async () => {
  await page.goto(`/events/${eventId}`);
  const rows = page.getByRole("row");
  await expect(rows).toHaveCount(3);

  // Linkurile semnate emise înainte de ștergere.
  const oldUrls = await Promise.all([0, 1].map((i) => rows.nth(i).locator("img").getAttribute("src")));

  await rows.nth(0).locator("label").click();
  await expect(rows.nth(0).getByRole("checkbox")).toBeChecked();
  await rows.nth(1).locator("label").click();
  await page.getByRole("button", { name: "Șterge selecția (2)" }).click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("2 fișiere");
  await expect(dialog).toContainText("ireversibil");
  await dialog.getByRole("button", { name: "Șterge definitiv" }).click();

  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Cristi");
  await expect(page.getByText("Arhiva anterioară nu mai este disponibilă")).toBeVisible();

  // După cel mult 60 s, niciun link emis anterior nu mai funcționează.
  for (const url of oldUrls) {
    expect(url).not.toBeNull();
    await expect
      .poll(async () => (await page.request.get(url ?? "")).status(), { timeout: 65_000, intervals: [2000] })
      .toBeGreaterThanOrEqual(400);
  }

  // Reîncărcarea arată aceeași stare.
  await page.reload();
  await expect(page.getByRole("row")).toHaveCount(1);
});

test("renunțarea la confirmare nu șterge nimic", async () => {
  await page.goto(`/events/${eventId}`);
  await page.getByRole("row").first().locator("label").click();
  await page.getByRole("button", { name: "Șterge selecția (1)" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Renunță" }).click();
  await expect(page.getByRole("row")).toHaveCount(1);
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { createEvent, createOrganizer, serviceClient } from "./support/db";
import { gotoHydrated } from "./support/page";

// US2 — invitatul încarcă poze și video de pe telefon (quickstart 4–6).
const MIME: Record<string, string> = { jpg: "image/jpeg", heic: "image/heic", mp4: "video/mp4", mov: "video/quicktime" };
const fixture = (name: string) => ({
  name,
  mimeType: MIME[name.split(".").pop() ?? ""] ?? "application/octet-stream",
  buffer: readFileSync(fileURLToPath(new URL(`../../../../fixtures/media/${name}`, import.meta.url))),
});
const HOUR = 3_600_000;

test.describe("pagina de upload a invitatului", () => {
  test("încarcă mai multe fișiere fără cont, cu progres și confirmare (FR-011–FR-015)", async ({ page }) => {
    const event = await createEvent({ organizerEmail: await createOrganizer(), name: "Nunta Elena și Dan" });
    await gotoHydrated(page, `/e/${event.token}`);

    await expect(page.getByRole("heading", { name: "Nunta Elena și Dan" })).toBeVisible();
    await expect(page.getByText("Cum folosim datele tale")).toBeVisible();
    await page.getByLabel("Numele tău (opțional)").fill("Maria 🌸");

    await page.getByLabel("Alege poze și video").setInputFiles([
      fixture("android.jpg"),
      fixture("iphone.heic"),
      fixture("corrupt.jpg"),
      fixture("clip.mp4"),
    ]);
    await expect(page.getByRole("progressbar")).toHaveCount(4);
    await expect(page.getByRole("status").filter({ hasText: "4 fișiere încărcate" })).toBeVisible({ timeout: 60_000 });
  });

  test("numele completat după primul fișier ajunge pe toate fișierele și rămâne după reîncărcare", async ({ page }) => {
    const event = await createEvent({ organizerEmail: await createOrganizer() });
    await gotoHydrated(page, `/e/${event.token}`);
    await page.getByLabel("Alege poze și video").setInputFiles([fixture("android.jpg")]);
    await expect(page.getByRole("status").filter({ hasText: "1 fișier încărcat" })).toBeVisible({ timeout: 60_000 });

    await page.getByLabel("Numele tău (opțional)").fill("Ioana");
    await page.getByLabel("Alege poze și video").setInputFiles([fixture("corrupt.jpg")]);
    await expect(page.getByRole("status").filter({ hasText: "2 fișiere încărcate" })).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(async () => {
        const { data } = await serviceClient().from("media_items").select("guest_name").eq("event_id", event.id);
        return (data ?? []).map((r) => r.guest_name);
      })
      .toEqual(["Ioana", "Ioana"]);

    await gotoHydrated(page, `/e/${event.token}`);
    await expect(page.getByLabel("Numele tău (opțional)")).toHaveValue("Ioana");
  });

  test("butonul de cameră deschide captura foto (FR-013)", async ({ page }) => {
    const event = await createEvent({ organizerEmail: await createOrganizer() });
    await gotoHydrated(page, `/e/${event.token}`);
    const camera = page.getByLabel("Fă o poză");
    await expect(camera).toHaveAttribute("capture", "environment");
    await expect(camera).toHaveAttribute("accept", "image/*");
  });

  test("aplică limita de fișiere și refuză fișierele prea mari sau de tip nepermis (FR-017, FR-020)", async ({ page }) => {
    const event = await createEvent({
      organizerEmail: await createOrganizer(),
      maxFilesPerGuest: 2,
      maxPhotoBytes: 50 * 1024,
    });
    await gotoHydrated(page, `/e/${event.token}`);
    await page.getByLabel("Alege poze și video").setInputFiles([
      { name: "notite.txt", mimeType: "text/plain", buffer: Buffer.from("text") },
      fixture("android.jpg"), // 110 KB > 50 KB
      fixture("corrupt.jpg"), // 4 KB
      fixture("fake.jpg"),
      fixture("clip.mp4"),
    ]);
    await expect(page.getByText("Acest tip de fișier nu este acceptat")).toBeVisible();
    await expect(page.getByText("Fișierul este prea mare (maximum 50 KB).")).toBeVisible();
    await expect(page.getByText("Ai atins limita de 2 fișiere pentru acest eveniment.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("status").filter({ hasText: "2 fișiere încărcate" })).toBeVisible({ timeout: 60_000 });
  });

  test("afișează mesaje clare pentru eveniment neînceput, încheiat sau inexistent (FR-020)", async ({ page }) => {
    const organizer = await createOrganizer();
    const notStarted = await createEvent({ organizerEmail: organizer, startsInMs: 2 * HOUR, endsInMs: 5 * HOUR });
    const ended = await createEvent({ organizerEmail: organizer, startsInMs: -5 * HOUR, endsInMs: -HOUR });

    await page.goto(`/e/${notStarted.token}`);
    await expect(page.getByText("Încărcarea pozelor începe pe")).toBeVisible();

    await page.goto(`/e/${ended.token}`);
    await expect(page.getByText("Perioada de încărcare pentru acest eveniment s-a încheiat.")).toBeVisible();

    await page.goto("/e/tokenInexistent0000000");
    await expect(page.getByText("Evenimentul nu a fost găsit")).toBeVisible();
  });

  test("un invitat nu vede niciodată fișierele altor invitați (FR-022)", async ({ browser }) => {
    const event = await createEvent({ organizerEmail: await createOrganizer() });
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await gotoHydrated(otherPage, `/e/${event.token}`);
    await otherPage.getByLabel("Alege poze și video").setInputFiles([fixture("android.jpg")]);
    await expect(otherPage.getByRole("status").filter({ hasText: "1 fișier încărcat" })).toBeVisible({ timeout: 60_000 });
    await other.close();

    const mine = await browser.newContext();
    const page = await mine.newPage();
    await gotoHydrated(page, `/e/${event.token}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("android.jpg")).toHaveCount(0);
    await mine.close();
  });
});

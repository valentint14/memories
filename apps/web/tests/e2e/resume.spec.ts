import { expect, test, type Page } from "@playwright/test";
import { createEvent, createOrganizer, serviceClient } from "./support/db";
import { gotoHydrated } from "./support/page";

// US6 — uploadul se reia după întreruperi (quickstart 7, 8, SC-005).
const MB = 1024 * 1024;

/** JPEG „mare” (antet valid + umplutură): suficient pentru un upload lung, respins apoi de worker. */
function bigJpeg(name: string, size: number) {
  const buffer = Buffer.alloc(size);
  buffer.set([0xff, 0xd8, 0xff, 0xe0], 0);
  return { name, mimeType: "image/jpeg", buffer };
}

async function throttleUpload(page: Page, bytesPerSecond: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 20,
    downloadThroughput: 10 * MB,
    uploadThroughput: bytesPerSecond,
  });
}

async function progressOf(page: Page): Promise<number> {
  return Number(await page.getByRole("progressbar").first().getAttribute("aria-valuenow"));
}

test.describe("reluare automată (doar Chromium: încetinirea rețelei prin CDP)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "CDP disponibil doar în Chromium");

  test("după o cădere de rețea, uploadul continuă de unde a rămas (FR-016, SC-005)", async ({ page }) => {
    const event = await createEvent({ organizerEmail: await createOrganizer() });
    await gotoHydrated(page, `/e/${event.token}`);
    await throttleUpload(page, 1.5 * MB);

    const offsets: number[] = [];
    page.on("request", (req) => {
      if (req.method() === "PATCH" && req.url().includes("/upload/resumable")) {
        offsets.push(Number(req.headers()["upload-offset"] ?? "0"));
      }
    });

    await page.getByLabel("Alege poze și video").setInputFiles([bigJpeg("mare.jpg", 30 * MB)]);
    await expect.poll(() => progressOf(page), { timeout: 60_000 }).toBeGreaterThanOrEqual(25);

    await page.context().setOffline(true);
    await expect(page.getByText("În pauză din cauza rețelei; se reia automat.")).toBeVisible();
    await expect(page.getByText("Uploadul e în pauză din cauza rețelei")).toBeVisible();
    await page.waitForTimeout(3000);
    const beforeResume = offsets.length;
    await page.context().setOffline(false);

    await expect(page.getByRole("status").filter({ hasText: "1 fișier încărcat" })).toBeVisible({ timeout: 90_000 });
    // Primul PATCH după revenire pornește de la un offset > 0: nu se retrimite partea deja transferată.
    const resumed = offsets.slice(beforeResume);
    expect(resumed.length).toBeGreaterThan(0);
    expect(resumed[0]).toBeGreaterThan(0);
  });

  test("după reîncărcarea paginii, invitatul reselectează doar fișierele neterminate (FR-016a)", async ({ page }) => {
    const event = await createEvent({ organizerEmail: await createOrganizer() });
    await gotoHydrated(page, `/e/${event.token}`);
    await throttleUpload(page, 1.5 * MB);
    await page.getByLabel("Alege poze și video").setInputFiles([bigJpeg("neterminat.jpg", 30 * MB)]);
    await expect(page.getByText("Te rugăm să ții pagina deschisă")).toBeVisible();
    await expect.poll(() => progressOf(page), { timeout: 60_000 }).toBeGreaterThanOrEqual(10);

    await page.reload();
    await expect(page.getByText("neterminat.jpg")).toBeVisible();
    await page.getByLabel("Alege din nou fișierele neterminate").setInputFiles([bigJpeg("neterminat.jpg", 30 * MB)]);
    await expect(page.getByRole("status").filter({ hasText: "1 fișier încărcat" })).toBeVisible({ timeout: 90_000 });

    // Rezervarea a fost reluată: un singur rând pentru fișier, limita nu s-a consumat de două ori.
    const { data } = await serviceClient().from("media_items").select("id").eq("event_id", event.id);
    expect(data).toHaveLength(1);
  });
});

test("un fișier care nu se poate încărca oferă reîncercare manuală (US6-3)", async ({ page }) => {
  const event = await createEvent({ organizerEmail: await createOrganizer() });
  await gotoHydrated(page, `/e/${event.token}`);
  // Serverul de upload refuză cererile (4xx: tus nu mai reîncearcă automat).
  await page.route("**/storage/v1/upload/resumable/**", (route) => route.fulfill({ status: 403, body: "refuzat" }));
  await page.getByLabel("Alege poze și video").setInputFiles([bigJpeg("refuzat.jpg", 1 * MB)]);
  const retry = page.getByRole("button", { name: "Reîncearcă" });
  await expect(retry).toBeVisible({ timeout: 30_000 });

  await page.unrouteAll();
  await retry.click();
  await expect(page.getByRole("status").filter({ hasText: "1 fișier încărcat" })).toBeVisible({ timeout: 60_000 });
});

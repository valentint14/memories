import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Browser } from "@playwright/test";
import { loginWithMagicLink } from "./support/auth";
import { createEvent, createOrganizer, randomEmail, serviceClient } from "./support/db";
import { gotoHydrated, uniqueName } from "./support/page";
import { futureDate } from "./support/self-service";

// US6 — invitatul primește un mesaj clar când nu poate încărca (002: FR-031, FR-032).
const photo = {
  name: "android.jpg",
  mimeType: "image/jpeg",
  buffer: readFileSync(fileURLToPath(new URL("../../../../fixtures/media/android.jpg", import.meta.url))),
};

async function tokenOf(eventId: string): Promise<string> {
  const { data } = await serviceClient().from("events").select("public_token").eq("id", eventId).single();
  return data?.public_token ?? "";
}

/** Un eveniment în așteptarea activării, creat din contul unui organizator nou. */
async function awaitingEvent(browser: Browser, name: string): Promise<string> {
  const organizerContext = await browser.newContext(test.info().project.use);
  const organizer = await organizerContext.newPage();
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
    await organizerContext.close();
  }
}

test("evenimentul neactivat: numele și mesajul, fără formular de upload", async ({ page, browser }) => {
  const name = uniqueName("Botez neactivat");
  const eventId = await awaitingEvent(browser, name);
  await gotoHydrated(page, `/e/${await tokenOf(eventId)}`);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "nu este încă deschisă" })).toBeVisible();
  await expect(page.getByLabel("Alege poze și video")).toHaveCount(0);
});

test("evenimentul suspendat: mesaj politicos, fără motiv și fără formular", async ({ page }) => {
  const event = await createEvent({ organizerEmail: await createOrganizer(), name: uniqueName("Suspendat") });
  await serviceClient().rpc("transition_event", { p_event_id: event.id, p_to: "suspended", p_source: "admin", p_reason: "motiv intern" });
  await gotoHydrated(page, `/e/${event.token}`);
  await expect(page.getByRole("status").filter({ hasText: "nu primește momentan fișiere" })).toBeVisible();
  await expect(page.getByText("motiv intern")).toHaveCount(0);
  await expect(page.getByLabel("Alege poze și video")).toHaveCount(0);
});

test("evenimentul neconfirmat nu există pentru invitați", async ({ page }) => {
  const { data: requestId } = await serviceClient().rpc("request_self_service_event", {
    p_email: randomEmail("guest-unconf"),
    p_name: "Neconfirmat",
    p_event_date: futureDate(10),
    p_terms_version: "2026-10-01",
    p_privacy_version: "2026-10-01",
  });
  const { data: request } = await serviceClient().from("auth_requests").select("event_id").eq("id", requestId ?? "").single();
  await gotoHydrated(page, `/e/${await tokenOf(request?.event_id ?? "")}`);
  await expect(page.getByRole("heading", { name: "Evenimentul nu a fost găsit" })).toBeVisible();
});

test("dacă evenimentul e suspendat cu pagina deschisă, fișierele noi primesc mesajul politicos", async ({ page }) => {
  const event = await createEvent({ organizerEmail: await createOrganizer(), name: uniqueName("Suspendat în timpul uploadului") });
  await gotoHydrated(page, `/e/${event.token}`);
  await expect(page.getByLabel("Alege poze și video")).toBeVisible();
  await serviceClient().rpc("transition_event", { p_event_id: event.id, p_to: "suspended", p_source: "admin", p_reason: "verificare" });

  await page.getByLabel("Alege poze și video").setInputFiles([photo]);
  await expect(page.getByText("Evenimentul nu primește momentan fișiere.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("A apărut o eroare")).toHaveCount(0);
});

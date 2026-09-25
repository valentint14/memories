import { expect, test } from "@playwright/test";
import { loginWithMagicLink } from "./support/auth";
import { createEvent, createOrganizer, serviceClient, uploadAsGuest, waitForProcessed } from "./support/db";
import { gotoHydrated, uniqueName } from "./support/page";
import { futureDate } from "./support/self-service";

// US7 — organizatorul își modifică sau își șterge evenimentul (002: FR-033–FR-035).

test("redenumirea și schimbarea datei păstrează linkul și codul QR", async ({ page }) => {
  await loginWithMagicLink(page, await createOrganizer());
  await gotoHydrated(page, "/events/new");
  await page.getByLabel("Numele evenimentului").fill(uniqueName("Nume greșit"));
  await page.getByLabel("Data evenimentului").fill(futureDate(20));
  await page.getByRole("checkbox", { name: /Accept termenii/ }).check();
  await page.getByRole("button", { name: "Creează evenimentul" }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
  const eventId = page.url().split("/").pop() ?? "";
  const { data: before } = await serviceClient().from("events").select("public_token").eq("id", eventId).single();

  const section = page.getByRole("region", { name: "Detaliile evenimentului" });
  const name = uniqueName("Nume corect");
  await section.getByLabel("Numele evenimentului").fill(name);
  await section.getByLabel("Data evenimentului").fill(futureDate(45));
  await section.getByRole("button", { name: "Salvează" }).click();
  await expect(section.getByRole("status")).toContainText("Linkul și codul QR rămân aceleași");
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

  const { data: after } = await serviceClient().from("events").select("public_token, event_date").eq("id", eventId).single();
  expect(after?.public_token).toBe(before?.public_token);
  expect(after?.event_date).toBe(futureDate(45));
});

test("ștergerea cere numele exact; linkul invitaților și fișierele devin inaccesibile", async ({ page }) => {
  const email = await createOrganizer();
  const name = uniqueName("Aniversare de șters");
  const event = await createEvent({ organizerEmail: email, name });
  await waitForProcessed([await uploadAsGuest(event.token, "android.jpg", "image/jpeg")]);

  await loginWithMagicLink(page, email);
  await gotoHydrated(page, `/events/${event.id}`);
  // Un URL semnat emis înainte de ștergere (001/SC-011).
  await page.getByRole("row").first().click();
  const signed = await page.getByRole("link", { name: "Descarcă originalul" }).getAttribute("href");
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Șterge evenimentul" }).click();
  const dialog = page.getByRole("alertdialog");
  const confirm = dialog.getByRole("button", { name: "Șterge definitiv" });
  await dialog.getByLabel("Tastează numele evenimentului").fill(`${name} x`);
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel("Tastează numele evenimentului").fill(name);
  await confirm.click();
  await expect(page).toHaveURL(/\/events$/);

  await page.goto(`/e/${event.token}`);
  await expect(page.getByRole("heading", { name: "Evenimentul nu a fost găsit" })).toBeVisible();
  await expect
    .poll(async () => (await page.request.get(signed ?? "")).status(), { timeout: 60_000, intervals: [2_000] })
    .toBeGreaterThanOrEqual(400);
});

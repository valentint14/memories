import { expect, test, type Browser, type Page } from "@playwright/test";
import { loginAsNewAdmin, loginWithMagicLink } from "./support/auth";
import { createAdmin, createOrganizer, serviceClient } from "./support/db";
import { fillDate, gotoHydrated, uniqueName } from "./support/page";
import { futureDate } from "./support/self-service";

// US4 — administratorul gestionează evenimentele self-service (002: FR-022–FR-029, FR-028a).
test.describe.configure({ mode: "serial" });

let organizer: Page;
let admin: Page;
let eventId: string;
let name: string;

async function openPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext(test.info().project.use);
  return context.newPage();
}

/** Activarea: fără motiv, dar dialogul arată evenimentul, ca verificare înainte de confirmare. */
async function confirmActivation(page: Page, eventName: string): Promise<void> {
  await page.getByRole("button", { name: "Activează pachetul complet" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByTestId("state-subject")).toContainText(eventName);
  await expect(dialog.getByLabel("Motiv (se păstrează în istoric)")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Activează", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

async function confirmState(page: Page, button: string, reason: string, confirm: string): Promise<void> {
  await page.getByRole("button", { name: button }).click();
  const dialog = page.getByRole("alertdialog");
  const submit = dialog.getByRole("button", { name: confirm });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel("Motiv (se păstrează în istoric)").fill(reason);
  await submit.click();
  await expect(dialog).toHaveCount(0);
}

test.beforeAll(async ({ browser }) => {
  organizer = await openPage(browser);
  await loginWithMagicLink(organizer, await createOrganizer());
  name = uniqueName("Nuntă de activat");
  await gotoHydrated(organizer, "/events/new");
  await organizer.getByLabel("Numele evenimentului").fill(name);
  await fillDate(organizer, "Data evenimentului", futureDate(20));
  await organizer.getByRole("checkbox", { name: /Accept termenii/ }).check();
  await organizer.getByRole("button", { name: "Creează evenimentul" }).click();
  await expect(organizer).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
  eventId = organizer.url().split("/").pop() ?? "";
  // 003: fără cerere de activare; organizatorul vede direct plata.
  await expect(organizer.getByRole("button", { name: "Solicită activarea" })).toHaveCount(0);
  await expect(organizer.getByRole("button", { name: "Plătește și activează" })).toBeVisible();

  admin = await openPage(browser);
  await loginAsNewAdmin(admin, await createAdmin());
});

test.afterAll(async () => {
  await organizer.context().close();
  await admin.context().close();
});

test("registrul arată evenimentul neactivat în grupa „În așteptare”, fără grupa cererilor (FR-027; 003: FR-015)", async () => {
  await gotoHydrated(admin, "/admin/events?view=awaiting");
  await expect(admin.getByRole("region", { name: /Cer activare/ })).toHaveCount(0);
  const group = admin.getByRole("region", { name: /În așteptare/ });
  const row = group.getByRole("listitem").filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Self-service");
  await expect(row).toContainText("În așteptarea activării");
  await expect(row).toContainText("@example.test");
  await expect(row).toContainText("(dacă nu e activat)");
  await expect(row.getByRole("button", { name: `Activează ${name}` })).toBeVisible();

  await gotoHydrated(admin, "/admin/events?view=active");
  await expect(admin.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);

  await gotoHydrated(admin, `/admin/events?q=${encodeURIComponent(name)}`);
  await expect(admin.getByRole("listitem").filter({ hasText: name })).toHaveCount(1);
});

test("editează numele înainte de activare, apoi activează după confirmare; istoricul arată schimbările", async () => {
  await gotoHydrated(admin, `/admin/events/${eventId}`);
  name = `${name} (corectat)`;
  await admin.getByLabel("Numele evenimentului").fill(name);
  await admin.getByRole("button", { name: "Salvează" }).click();
  await expect(admin.getByRole("status").filter({ hasText: "salvate" })).toBeVisible();

  await confirmActivation(admin, name);
  await expect(admin.getByTestId("event-status")).toHaveText("Activ");

  const history = admin.getByRole("list", { name: "Istoricul stărilor" });
  await expect(history).toContainText("În așteptarea activării → Activ");
  await expect(history).toContainText("Administrator");

  const { data } = await serviceClient().from("events").select("status, name, base_price_minor").eq("id", eventId).single();
  expect(data).toEqual({ status: "active", name, base_price_minor: 29_900 });

  // Organizatorul vede evenimentul activ, cu același cod QR și panoul de retenție.
  await gotoHydrated(organizer, `/events/${eventId}`);
  await expect(organizer.getByRole("heading", { name })).toBeVisible();
  await expect(organizer.getByRole("region", { name: "Păstrarea fișierelor" })).toBeVisible();
});

test("suspendarea oprește uploadurile și lasă organizatorului doar vizualizarea, descărcarea și ștergerea", async () => {
  await gotoHydrated(admin, `/admin/events/${eventId}`);
  await confirmState(admin, "Suspendă", "conținut raportat", "Suspendă");
  await expect(admin.getByTestId("event-status")).toHaveText("Suspendat");

  await gotoHydrated(organizer, `/events/${eventId}`);
  await expect(organizer.getByRole("alert").filter({ hasText: "Evenimentul este suspendat" })).toBeVisible();
  await expect(organizer.getByRole("region", { name: "Păstrarea fișierelor" })).toHaveCount(0);

  await gotoHydrated(admin, `/admin/events/${eventId}`);
  await confirmState(admin, "Reactivează", "verificat, totul în regulă", "Reactivează");
  await expect(admin.getByTestId("event-status")).toHaveText("Activ");
  await expect(admin.getByRole("list", { name: "Istoricul stărilor" })).toContainText("Suspendat → Activ");
});

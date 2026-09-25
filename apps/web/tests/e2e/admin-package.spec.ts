import { expect, test } from "@playwright/test";
import { loginAsNewAdmin, loginWithMagicLink } from "./support/auth";
import { createAdmin, createEvent, createOrganizer, serviceClient } from "./support/db";
import { gotoHydrated, uniqueName } from "./support/page";
import { futureDate } from "./support/self-service";

// US5 — configurarea pachetului complet (002: FR-015, FR-016). Modifică pachetul global: rulează în
// lanțul secvențial al fișierelor cu stare globală (playwright.config.ts) și schimbă doar limita de
// fișiere per invitat, pe care alte teste nu o verifică.
test.describe.configure({ mode: "serial" });

let original: number;

test.beforeAll(async () => {
  const { data } = await serviceClient().from("packages").select("max_files_per_guest").eq("code", "complete").single();
  original = data?.max_files_per_guest ?? 50;
});

test.afterAll(async () => {
  await serviceClient().from("packages").update({ max_files_per_guest: original }).eq("code", "complete");
});

test("noile limite apar la evenimentele neactivate; cele active le păstrează pe ale lor", async ({ page, browser }) => {
  const activeOwner = await createOrganizer();
  const active = await createEvent({ organizerEmail: activeOwner, name: uniqueName("Deja activ") });
  const { data: before } = await serviceClient().from("events").select("max_files_per_guest").eq("id", active.id).single();

  await loginAsNewAdmin(page, await createAdmin());
  await gotoHydrated(page, "/admin/package");
  const next = original === 77 ? 78 : 77;
  await page.getByLabel("Fișiere per invitat").fill(String(next));
  await page.getByRole("button", { name: "Salvează" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Pachetul a fost salvat" })).toBeVisible();

  // Un eveniment neactivat afișează noua limită.
  const organizerContext = await browser.newContext(test.info().project.use);
  const organizer = await organizerContext.newPage();
  try {
    await loginWithMagicLink(organizer, await createOrganizer());
    await gotoHydrated(organizer, "/events/new");
    await organizer.getByLabel("Numele evenimentului").fill(uniqueName("Neactivat"));
    await organizer.getByLabel("Data evenimentului").fill(futureDate(20));
    await organizer.getByRole("checkbox", { name: /Accept termenii/ }).check();
    await organizer.getByRole("button", { name: "Creează evenimentul" }).click();
    await expect(organizer.getByRole("region", { name: "Activarea pachetului complet" })).toContainText(`până la ${String(next)} de fișiere`);
  } finally {
    await organizerContext.close();
  }

  const { data: after } = await serviceClient().from("events").select("max_files_per_guest").eq("id", active.id).single();
  expect(after).toEqual(before);
});

test("valorile invalide sunt refuzate, cu erori lângă câmpuri", async ({ page }) => {
  await loginAsNewAdmin(page, await createAdmin());
  await gotoHydrated(page, "/admin/package");
  await page.getByLabel("Fișiere per invitat").fill("0");
  await page.getByLabel("Dimensiunea maximă a unei poze (MB)").fill("51");
  await page.getByRole("button", { name: "Salvează" }).click();
  await expect(page.getByText("Introdu un număr între 1 și 1000.")).toBeVisible();
  await expect(page.getByLabel("Dimensiunea maximă a unei poze (MB)")).toHaveAttribute("aria-invalid", "true");
});

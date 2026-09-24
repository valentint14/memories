import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loginAsNewAdmin, loginWithMagicLink } from "./support/auth";
import { createAdmin, createEvent, createOrganizer, serviceClient } from "./support/db";
import { gotoHydrated, uniqueName } from "./support/page";

// US8 — organizatorul alege cât timp se păstrează fișierele (quickstart 16, 18–21).
test.describe.configure({ mode: "serial" });

let context: BrowserContext | undefined;
let page: Page;
let email: string;

async function optionId(months: number): Promise<string> {
  const { data, error } = await serviceClient().from("retention_options").select("id").eq("months", months).single();
  if (error) throw error;
  return data.id;
}

async function setSurcharge(months: number, minor: number): Promise<void> {
  const { error } = await serviceClient().from("retention_options").update({ surcharge_minor: minor }).eq("months", months);
  if (error) throw error;
}

test.beforeAll(async ({ browser }) => {
  email = await createOrganizer();
  context = await browser.newContext(test.info().project.use);
  page = await context.newPage();
  await loginWithMagicLink(page, email);
});

test.afterAll(async () => {
  await setSurcharge(6, 4900);
  await setSurcharge(12, 9900);
  await context?.close();
});

test("organizatorul prelungește retenția și vede noul preț final (FR-041–FR-043, SC-013)", async () => {
  const event = await createEvent({ organizerEmail: email, name: uniqueName("Nunta retenție"), months: 3 });
  await gotoHydrated(page, `/events/${event.id}`);

  const panel = page.getByRole("region", { name: "Păstrarea fișierelor" });
  // Rezumatul curent (etichetele opțiunilor conțin și ele durate și prețuri).
  const summary = panel.getByText(/^Păstrare /);
  await expect(summary).toContainText("3 luni, preț final 299,00");

  // Opțiunea curentă și cele mai scurte nu se pot alege (FR-042).
  await expect(panel.getByRole("radio", { name: /^3 luni/ })).toBeDisabled();
  await panel.getByRole("radio", { name: /^12 luni/ }).check({ force: true });
  await panel.getByRole("button", { name: "Prelungește păstrarea" }).click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("398,00");
  await expect(dialog).toContainText("+99,00");
  await dialog.getByRole("button", { name: /Confirmă prelungirea/ }).click();

  await expect(summary).toContainText("12 luni, preț final 398,00");
  // Reîmprospătarea paginii după confirmare se termină înainte de următoarea navigare.
  await page.waitForLoadState("networkidle");

  const { data: row } = await serviceClient().from("events").select("final_price_minor, retention_months").eq("id", event.id).single();
  expect(row).toEqual({ final_price_minor: 39_800, retention_months: 12 });
  const { data: history } = await serviceClient()
    .from("event_retention_changes")
    .select("actor_kind, to_months")
    .eq("event_id", event.id)
    .order("id", { ascending: false })
    .limit(1);
  expect(history?.[0]).toEqual({ actor_kind: "organizer", to_months: 12 });
});

test("dacă prețul se schimbă între timp, dialogul arată prețul nou înainte de confirmare", async () => {
  const event = await createEvent({ organizerEmail: email, name: uniqueName("Nunta preț"), months: 3 });
  await gotoHydrated(page, `/events/${event.id}`);
  const panel = page.getByRole("region", { name: "Păstrarea fișierelor" });
  await panel.getByRole("radio", { name: /^6 luni/ }).check({ force: true });
  await panel.getByRole("button", { name: "Prelungește păstrarea" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("348,00");

  await setSurcharge(6, 5900);
  await dialog.getByRole("button", { name: /Confirmă prelungirea/ }).click();
  await expect(dialog.getByText("Prețul s-a schimbat")).toBeVisible();
  await expect(dialog).toContainText("358,00");
  await dialog.getByRole("button", { name: /Confirmă prelungirea/ }).click();
  await expect(panel.getByText(/^Păstrare /)).toContainText("6 luni, preț final 358,00");
  await page.waitForLoadState("networkidle");
});

test("un eveniment expirat apare ca „expirat”, fără galerie, iar linkul invitaților nu mai funcționează (FR-044)", async () => {
  const event = await createEvent({ organizerEmail: email, name: uniqueName("Nunta expirată") });
  await serviceClient().from("events").update({ status: "expiring" }).eq("id", event.id);
  await serviceClient().rpc("complete_event_expiry", { p_event_id: event.id });

  await page.goto("/events");
  const card = page.getByRole("listitem").filter({ hasText: "Nunta expirată" });
  await expect(card).toContainText("Expirat");
  await page.goto(`/events/${event.id}`);
  await expect(page.getByText("Perioada de păstrare s-a încheiat")).toBeVisible();
  await expect(page.getByRole("grid")).toHaveCount(0);

  await page.goto(`/e/${event.token}`);
  await expect(page.getByText("Evenimentul nu a fost găsit")).toBeVisible();
});

test("administratorul editează catalogul fără efect asupra evenimentelor existente (FR-038, US8-6)", async ({ browser }) => {
  const existing = await createEvent({ organizerEmail: email, name: uniqueName("Nunta 12 luni"), months: 12 });
  const adminContext = await browser.newContext(test.info().project.use);
  const admin = await adminContext.newPage();
  try {
    await loginAsNewAdmin(admin, await createAdmin());
    await gotoHydrated(admin, "/admin/retention");
    const row = admin.getByRole("row", { name: /12 luni/ });
    await row.getByLabel("Supliment (lei)").fill("149");
    await row.getByRole("button", { name: "Salvează" }).click();
    await expect(row.getByText("Salvat")).toBeVisible();

    const { data } = await serviceClient().from("events").select("final_price_minor").eq("id", existing.id).single();
    expect(data?.final_price_minor).toBe(39_800);

    // O opțiune folosită de evenimente nu poate fi ștearsă.
    await row.getByRole("button", { name: "Șterge" }).click();
    await expect(row.getByText("folosită de evenimente")).toBeVisible();
    expect(await optionId(12)).toBeTruthy();
  } finally {
    await adminContext.close();
  }
});

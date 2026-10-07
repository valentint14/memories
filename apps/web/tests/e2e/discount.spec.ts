import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAsNewAdmin, loginWithMagicLink } from "./support/auth";
import { createAdmin, createOrganizer, serviceClient } from "./support/db";
import { fillDate, gotoHydrated, uniqueName, waitForHydration } from "./support/page";
import { futureDate } from "./support/self-service";
import { payFakeSession, sendWebhook, sessionIdFromCheckoutUrl, stubCheckoutPage } from "./support/stripe";

// Codurile de reducere (005).
const CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;

test("adminul generează coduri personale și de campanie, apoi dezactivează unul (US1)", async ({ page }) => {
  await loginAsNewAdmin(page, await createAdmin());
  // Pe telefon, linkurile stau în „Meniu”; pe desktop, linkul e în bară.
  if (!test.info().project.name.startsWith("mobile")) {
    await gotoHydrated(page, "/admin/events");
    await page.getByRole("link", { name: "Coduri de reducere" }).first().click();
  } else {
    await gotoHydrated(page, "/admin/discounts");
  }
  await expect(page.getByRole("heading", { level: 1, name: "Coduri de reducere" })).toBeVisible();
  await waitForHydration(page);

  const form = page.getByRole("region", { name: "Generează coduri" });
  await form.getByLabel("Valoarea reducerii").fill("50");
  await form.getByLabel("Câte coduri").fill("3");
  await fillDate(form, "Valabil până la (opțional)", futureDate(30));
  await form.getByLabel("Notă internă (opțional)").fill("Test e2e");
  await form.getByRole("button", { name: "Generează" }).click();

  // Fereastra de succes: titlul, rezumatul și codurile, fiecare cu copiere.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "3 coduri generate" })).toBeVisible();
  await expect(dialog).toContainText("personal");
  const generated = dialog.getByRole("list", { name: "Coduri generate" }).getByRole("listitem");
  await expect(generated).toHaveCount(3);
  const codes = (await generated.allInnerTexts()).map((c) => c.trim());
  for (const c of codes) expect(c).toMatch(CODE);
  expect(new Set(codes).size).toBe(3);
  await expect(dialog.getByRole("button", { name: `Copiază codul ${codes[0] ?? ""}` })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Copiază tot" })).toBeVisible();
  await waitForHydration(page);
  const dialogA11y = await new AxeBuilder({ page }).include("[role=dialog]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(dialogA11y.violations.map((v) => v.id)).toEqual([]);
  await dialog.getByRole("button", { name: "Închide" }).click();
  await expect(dialog).toHaveCount(0);

  // Cod de campanie: 15%, maxim 30 de utilizări.
  await form.getByRole("button", { name: /Felul codului/ }).click();
  await page.getByRole("option", { name: /De campanie/ }).click();
  await form.getByRole("button", { name: /Tipul reducerii/ }).click();
  await page.getByRole("option", { name: /Procent/ }).click();
  await form.getByLabel("Valoarea reducerii").fill("15");
  await form.getByLabel("Numărul maxim de utilizări").fill("30");
  await form.getByRole("button", { name: "Generează" }).click();
  await expect(dialog.getByRole("heading", { name: "1 cod generat" })).toBeVisible();
  const campaign = (await generated.innerText()).trim();
  await dialog.getByRole("button", { name: "Închide" }).click();

  await page.reload();
  const list = page.getByRole("region", { name: "Coduri" }).last();
  const row = list.getByRole("listitem").filter({ hasText: campaign });
  await expect(row).toContainText("0 din 30 utilizări");
  await expect(row).toContainText("15%");

  // Dezactivarea unui cod personal.
  const personal = list.getByRole("listitem").filter({ hasText: codes[0]?.trim() ?? "" });
  await personal.getByRole("button", { name: "Dezactivează" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Dezactivează" }).click();
  await expect(personal).toContainText("Dezactivat");

  // Ștergerea unui cod nefolosit: dispare din listă.
  const removable = list.getByRole("listitem").filter({ hasText: codes[1] ?? "" });
  await removable.getByRole("button", { name: "Șterge" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Ștergi definitiv");
  await page.getByRole("alertdialog").getByRole("button", { name: "Șterge" }).click();
  await expect(list.getByRole("listitem").filter({ hasText: codes[1] ?? "" })).toHaveCount(0);

  await waitForHydration(page);
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(accessibility.violations.map((v) => v.id)).toEqual([]);
});

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Un cod personal nou, inserat direct (ca generarea din administrare), formatat „XXXX-XXXX”. */
async function newCode(valueMinor = 5_000): Promise<string> {
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => ALPHABET[b % ALPHABET.length]).join("");
  const { error } = await serviceClient()
    .from("discount_codes")
    .insert({ code: raw, kind: "personal", discount_type: "fixed", discount_value: valueMinor, max_uses: 1, batch_id: crypto.randomUUID() });
  if (error) throw new Error(error.message);
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

async function newAwaitingEvent(page: Page): Promise<string> {
  await loginWithMagicLink(page, await createOrganizer());
  await gotoHydrated(page, "/events/new");
  await page.getByLabel("Numele evenimentului").fill(uniqueName("Nunta cu reducere"));
  await fillDate(page, "Data evenimentului", futureDate(20));
  await page.getByRole("checkbox", { name: /Accept termenii/ }).check();
  await page.getByRole("button", { name: "Creează evenimentul" }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop() ?? "";
}

test("organizatorul aplică un cod, plătește suma redusă, iar codul nu mai poate fi folosit (US2)", async ({ page, browser }) => {
  const code = await newCode(5_000);
  const eventId = await newAwaitingEvent(page);
  const panel = page.getByRole("region", { name: "Activarea pachetului complet" });

  // Un cod greșit: mesaj lângă câmp, prețul rămâne întreg.
  await panel.getByLabel("Cod de reducere").fill("ZZZZ-ZZZZ");
  await panel.getByRole("button", { name: "Aplică" }).click();
  await expect(panel.getByRole("alert")).toHaveText("Codul nu există sau nu mai este valabil.");

  await panel.getByLabel("Cod de reducere").fill(code.toLowerCase().replace("-", " "));
  await panel.getByRole("button", { name: "Aplică" }).click();
  await expect(panel.getByText(`Cod ${code}`)).toBeVisible();
  await expect(panel.locator("s").first()).toBeVisible(); // prețul întreg, tăiat

  await waitForHydration(page);
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(accessibility.violations.map((v) => v.id)).toEqual([]);

  await stubCheckoutPage(page);
  await panel.getByRole("button", { name: "Plătește și activează" }).click();
  const session = await payFakeSession(await sessionIdFromCheckoutUrl(page));
  expect(await sendWebhook(page, "checkout.session.completed", session)).toBe(200);

  const { data: payment } = await serviceClient()
    .from("payments")
    .select("status, amount_minor, full_amount_minor, discount_minor")
    .eq("event_id", eventId)
    .single();
  expect(payment).toMatchObject({ status: "paid", discount_minor: 5_000 });
  expect(payment?.amount_minor).toBe((payment?.full_amount_minor ?? 0) - 5_000);
  expect(session.amount_total).toBe(payment?.amount_minor);

  // Alt organizator: codul a fost deja folosit.
  const context = await browser.newContext(test.info().project.use);
  const other = await context.newPage();
  try {
    await newAwaitingEvent(other);
    const otherPanel = other.getByRole("region", { name: "Activarea pachetului complet" });
    await otherPanel.getByLabel("Cod de reducere").fill(code);
    await otherPanel.getByRole("button", { name: "Aplică" }).click();
    await expect(otherPanel.getByRole("alert")).toHaveText("Codul a fost deja folosit.");
  } finally {
    await context.close();
  }
});

test("„Elimină codul” readuce prețurile întregi (US2)", async ({ page }) => {
  const code = await newCode(5_000);
  await newAwaitingEvent(page);
  const panel = page.getByRole("region", { name: "Activarea pachetului complet" });
  await panel.getByLabel("Cod de reducere").fill(code);
  await panel.getByRole("button", { name: "Aplică" }).click();
  await expect(panel.getByText(`Cod ${code}`)).toBeVisible();
  await panel.getByRole("button", { name: "Elimină codul" }).click();
  await expect(panel.getByText(`Cod ${code}`)).toHaveCount(0);
  await expect(panel.locator("s")).toHaveCount(0);
});

test("adminul vede utilizarea codului și reducerea în foaia „Plăți” (US3)", async ({ page, browser }) => {
  const code = await newCode(5_000);
  const eventId = await newAwaitingEvent(page);
  const panel = page.getByRole("region", { name: "Activarea pachetului complet" });
  await panel.getByLabel("Cod de reducere").fill(code);
  await panel.getByRole("button", { name: "Aplică" }).click();
  await expect(panel.getByText(`Cod ${code}`)).toBeVisible();
  await stubCheckoutPage(page);
  await panel.getByRole("button", { name: "Plătește și activează" }).click();
  const session = await payFakeSession(await sessionIdFromCheckoutUrl(page));
  expect(await sendWebhook(page, "checkout.session.completed", session)).toBe(200);

  const context = await browser.newContext(test.info().project.use);
  const admin = await context.newPage();
  try {
    await loginAsNewAdmin(admin, await createAdmin());
    await gotoHydrated(admin, `/admin/events/${eventId}`);
    const payments = admin.getByRole("region", { name: "Plăți" });
    await expect(payments).toContainText("Preț întreg");
    await expect(payments).toContainText(`(cod ${code})`);

    await gotoHydrated(admin, "/admin/discounts");
    const row = admin.getByRole("region", { name: "Coduri" }).last().getByRole("listitem").filter({ hasText: code });
    await expect(row).toContainText("Epuizat");
    await expect(row).toContainText("1 din 1 utilizări");
    // Un cod folosit nu se poate șterge, doar dezactiva.
    await expect(row.getByRole("button", { name: "Șterge" })).toHaveCount(0);
    await row.getByText("Utilizări (1)").click();
    await expect(row.getByRole("link")).toHaveAttribute("href", `/admin/events/${eventId}`);
  } finally {
    await context.close();
  }
});

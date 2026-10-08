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

  // Generarea se face într-o fereastră deschisă din antet.
  const openForm = async () => {
    await page.getByRole("button", { name: "Generează coduri" }).click();
    return page.getByRole("dialog", { name: "Generează coduri" });
  };
  let form = await openForm();
  await form.getByLabel("Valoarea reducerii").fill("50");
  await form.getByLabel("Câte coduri").fill("3");
  await fillDate(form, "Valabil până la (opțional)", futureDate(30));
  await form.getByLabel("Notă internă (opțional)").fill("Test e2e");
  await form.getByRole("button", { name: "Generează", exact: true }).click();

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
  form = await openForm();
  await form.getByRole("button", { name: /Felul codului/ }).click();
  await page.getByRole("option", { name: /De campanie/ }).click();
  await form.getByRole("button", { name: /Tipul reducerii/ }).click();
  await page.getByRole("option", { name: /Procent/ }).click();
  await form.getByLabel("Valoarea reducerii").fill("15");
  await form.getByLabel("Numărul maxim de utilizări").fill("30");
  await form.getByRole("button", { name: "Generează", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "1 cod generat" })).toBeVisible();
  const campaign = (await generated.innerText()).trim();
  await dialog.getByRole("button", { name: "Închide" }).click();

  await page.reload();
  const list = page.getByRole("region", { name: "Coduri" });
  // Fiecare cod se deschide într-o fereastră cu datele și acțiunile lui.
  const openCode = async (code: string) => {
    await list.getByRole("button", { name: `Detaliile codului ${code}` }).click();
    return page.getByRole("dialog", { name: code });
  };
  let detail = await openCode(campaign);
  await expect(detail).toContainText("0 din 30");
  await expect(detail).toContainText("15%");
  await expect(detail).toContainText("Codul nu a fost folosit încă.");
  await waitForHydration(page);
  const detailA11y = await new AxeBuilder({ page }).include("[role=dialog]").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(detailA11y.violations.map((v) => v.id)).toEqual([]);
  await detail.getByRole("button", { name: "Închide" }).click();

  // Dezactivarea unui cod personal: fereastra arată noua stare.
  detail = await openCode(codes[0] ?? "");
  await detail.getByRole("button", { name: "Dezactivează" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Dezactivează" }).click();
  await expect(detail).toContainText("Dezactivat");
  await detail.getByRole("button", { name: "Închide" }).click();
  await list.getByRole("button", { name: /Dezactivate/ }).click();
  await expect(list.getByRole("button", { name: `Detaliile codului ${codes[0] ?? ""}` })).toBeVisible();
  await list.getByRole("button", { name: /Toate/ }).click();

  // Ștergerea unui cod nefolosit: dispare din listă, iar fereastra lui se închide.
  detail = await openCode(codes[1] ?? "");
  await detail.getByRole("button", { name: "Șterge" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Ștergi definitiv");
  await page.getByRole("alertdialog").getByRole("button", { name: "Șterge" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(list.getByRole("button", { name: `Detaliile codului ${codes[1] ?? ""}` })).toHaveCount(0);

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
  await expect(panel.getByRole("button", { name: "Aplicat" })).toBeVisible();
  await expect(panel.getByRole("status")).toContainText(`Cod ${code} aplicat`);
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

test("câmpul golit și „Aplică” readuc prețurile întregi (US2)", async ({ page }) => {
  const code = await newCode(5_000);
  await newAwaitingEvent(page);
  const panel = page.getByRole("region", { name: "Activarea pachetului complet" });
  await panel.getByLabel("Cod de reducere").fill(code);
  await panel.getByRole("button", { name: "Aplică" }).click();
  await expect(panel.getByRole("button", { name: "Aplicat" })).toBeVisible();
  // Rândul codului nu lărgește coloana: pe un telefon îngust, pagina nu se derulează lateral.
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await panel.getByLabel("Cod de reducere").fill("");
  // Codul schimbat readuce butonul la „Aplică”.
  await panel.getByRole("button", { name: "Aplică" }).click();
  await expect(panel.getByRole("status")).toHaveCount(0);
  await expect(panel.locator("s")).toHaveCount(0);
});

test("adminul vede utilizarea codului și reducerea în foaia „Plăți” (US3)", async ({ page, browser }) => {
  const code = await newCode(5_000);
  const eventId = await newAwaitingEvent(page);
  const panel = page.getByRole("region", { name: "Activarea pachetului complet" });
  await panel.getByLabel("Cod de reducere").fill(code);
  await panel.getByRole("button", { name: "Aplică" }).click();
  await expect(panel.getByRole("button", { name: "Aplicat" })).toBeVisible();
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
    // Banda de cifre numără utilizarea; fereastra codului arată evenimentul și reducerea.
    await expect(admin.getByRole("definition").filter({ hasText: /RON/ }).first()).not.toHaveText("0,00 RON");
    await admin.getByRole("region", { name: "Coduri" }).getByRole("button", { name: `Detaliile codului ${code}` }).click();
    const detail = admin.getByRole("dialog", { name: code });
    await expect(detail).toContainText("Epuizat");
    await expect(detail).toContainText("1 din 1");
    await expect(detail).toContainText("Plătită · reducere 50,00 RON");
    // Un cod folosit nu se poate șterge, doar dezactiva.
    await expect(detail.getByRole("button", { name: "Șterge" })).toHaveCount(0);
    await expect(detail.getByRole("link")).toHaveAttribute("href", `/admin/events/${eventId}`);
  } finally {
    await context.close();
  }
});

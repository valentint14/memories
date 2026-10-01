import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAsNewAdmin, loginWithMagicLink } from "./support/auth";
import { createAdmin, createOrganizer, serviceClient } from "./support/db";
import { gotoHydrated, uniqueName, waitForHydration } from "./support/page";
import { futureDate } from "./support/self-service";
import { latestPayment, payFakeSession, sendWebhook, sessionIdFromCheckoutUrl, stubCheckoutPage } from "./support/stripe";

// US1 — organizatorul plătește și evenimentul devine activ (003: FR-001–FR-012a).

async function newAwaitingEvent(page: Page): Promise<string> {
  await loginWithMagicLink(page, await createOrganizer());
  await gotoHydrated(page, "/events/new");
  await page.getByLabel("Numele evenimentului").fill(uniqueName("Nunta plătită"));
  await page.getByLabel("Data evenimentului").fill(futureDate(20));
  await page.getByRole("checkbox", { name: /Accept termenii/ }).check();
  await page.getByRole("button", { name: "Creează evenimentul" }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop() ?? "";
}

async function priceOf(months: number): Promise<number> {
  const supabase = serviceClient();
  const { data: pkg } = await supabase.from("packages").select("price_minor").eq("code", "complete").single();
  const { data: option } = await supabase.from("retention_options").select("surcharge_minor").eq("months", months).single();
  return (pkg?.price_minor ?? 0) + (option?.surcharge_minor ?? 0);
}

test("plata cu opțiunea inclusă activează evenimentul prin webhook", async ({ page }) => {
  const eventId = await newAwaitingEvent(page);
  const panel = page.getByRole("region", { name: "Activarea pachetului complet" });
  await expect(panel.getByRole("radio", { name: /^3 luni/ })).toBeChecked();
  await expect(panel.getByRole("button", { name: "Solicită activarea" })).toHaveCount(0);

  await waitForHydration(page);
  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(accessibility.violations.map((v) => v.id)).toEqual([]);

  await stubCheckoutPage(page);
  await panel.getByRole("button", { name: "Plătește și activează" }).click();
  const sessionId = await sessionIdFromCheckoutUrl(page);

  const payment = await latestPayment(eventId);
  expect(payment).toMatchObject({ status: "open", stripe_session_id: sessionId, amount_minor: await priceOf(3) });

  const session = await payFakeSession(sessionId);
  expect(await sendWebhook(page, "checkout.session.completed", session)).toBe(200);

  await gotoHydrated(page, `/events/${eventId}`);
  await expect(page.getByText("Plată primită pe")).toBeVisible();
  await expect(page.getByRole("region", { name: "Activarea pachetului complet" })).toHaveCount(0);
  const { data: changes } = await serviceClient()
    .from("event_status_changes")
    .select("source, external_ref")
    .eq("event_id", eventId)
    .eq("to_status", "active");
  expect(changes).toEqual([{ source: "payment", external_ref: sessionId }]);
});

test("o perioadă mai lungă se plătește integral; la întoarcere, evenimentul e activ fără să aștepte webhook-ul", async ({ page }) => {
  const eventId = await newAwaitingEvent(page);
  const panel = page.getByRole("region", { name: "Activarea pachetului complet" });
  await panel.getByRole("radio", { name: /^12 luni/ }).check();

  await stubCheckoutPage(page);
  await panel.getByRole("button", { name: "Plătește și activează" }).click();
  const sessionId = await sessionIdFromCheckoutUrl(page);
  expect((await latestPayment(eventId)).amount_minor).toBe(await priceOf(12));

  // Plătită pe Stripe, fără webhook: pagina de întoarcere citește sesiunea direct din API.
  await payFakeSession(sessionId);
  await gotoHydrated(page, `/events/${eventId}?plata=${sessionId}`);
  await expect(page.getByText("Plată primită pe")).toBeVisible();
  const { data: event } = await serviceClient().from("events").select("status, retention_months").eq("id", eventId).single();
  expect(event).toEqual({ status: "active", retention_months: 12 });
});

// US2 — plata eșuată sau abandonată nu blochează evenimentul (003: FR-007, FR-008, FR-009).
test("anularea, expirarea și webhook-urile repetate lasă evenimentul în așteptare, gata de o nouă plată", async ({ page }) => {
  const eventId = await newAwaitingEvent(page);
  const panel = page.getByRole("region", { name: "Activarea pachetului complet" });
  await stubCheckoutPage(page);
  await panel.getByRole("button", { name: "Plătește și activează" }).click();
  const sessionId = await sessionIdFromCheckoutUrl(page);

  // Organizatorul revine din Checkout fără să plătească.
  await gotoHydrated(page, `/events/${eventId}?plata=anulata`);
  await expect(page.getByRole("status").filter({ hasText: "Nu s-a încasat nimic" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Plătește și activează" })).toBeEnabled();

  // Stripe închide sesiunea; același eveniment livrat de două ori nu schimbă nimic în plus.
  const expired = { id: sessionId, object: "checkout.session", payment_status: "unpaid", payment_intent: null, metadata: {} };
  const eventIdStripe = `evt_${crypto.randomUUID()}`;
  expect(await sendWebhook(page, "checkout.session.expired", expired, eventIdStripe)).toBe(200);
  expect(await sendWebhook(page, "checkout.session.expired", expired, eventIdStripe)).toBe(200);
  expect((await latestPayment(eventId)).status).toBe("expired");

  // O nouă încercare pornește o sesiune nouă.
  await panel.getByRole("button", { name: "Plătește și activează" }).click();
  const second = await sessionIdFromCheckoutUrl(page);
  expect(second).not.toBe(sessionId);
  const { data: event } = await serviceClient().from("events").select("status").eq("id", eventId).single();
  expect(event?.status).toBe("awaiting_activation");
});

// US3 — administratorul vede plata și datele de facturare (003: FR-013, FR-012a).
test("după plată, fișa adminului arată foaia „Plăți” cu suma, starea și facturarea", async ({ page, browser }) => {
  const eventId = await newAwaitingEvent(page);
  await stubCheckoutPage(page);
  await page.getByRole("button", { name: "Plătește și activează" }).click();
  const sessionId = await sessionIdFromCheckoutUrl(page);
  const session = await payFakeSession(sessionId);
  expect(await sendWebhook(page, "checkout.session.completed", session)).toBe(200);

  const context = await browser.newContext(test.info().project.use);
  const admin = await context.newPage();
  try {
    await loginAsNewAdmin(admin, await createAdmin());
    await gotoHydrated(admin, `/admin/events/${eventId}`);
    const sheet = admin.getByRole("region", { name: "Plăți" });
    await expect(sheet).toContainText("299,00");
    await expect(sheet).toContainText("Plătită");
    await expect(sheet).toContainText("Ana Pop");
    await expect(sheet).toContainText("Cluj-Napoca");
    await expect(admin.getByRole("status").filter({ hasText: "Plată online primită" })).toBeVisible();
  } finally {
    await context.close();
  }
});


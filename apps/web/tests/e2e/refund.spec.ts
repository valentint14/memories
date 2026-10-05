import { expect, test, type Page } from "@playwright/test";
import { loginWithMagicLink } from "./support/auth";
import { createOrganizer, serviceClient } from "./support/db";
import { gotoHydrated, uniqueName } from "./support/page";
import { futureDate } from "./support/self-service";
import { chargeRefunded, latestPayment, payFakeSession, sendWebhook, sessionIdFromCheckoutUrl, stubCheckoutPage } from "./support/stripe";

// Rambursările plăților (004): webhook-ul `charge.refunded` semnat, după o plată prin serverul Stripe fals.

interface PaidEvent {
  eventId: string;
  intent: string;
  amount: number;
}

/** Organizator nou care își activează evenimentul prin plată (ca în payment.spec.ts). */
async function paidEvent(page: Page): Promise<PaidEvent> {
  await loginWithMagicLink(page, await createOrganizer());
  await gotoHydrated(page, "/events/new");
  await page.getByLabel("Numele evenimentului").fill(uniqueName("Nunta rambursată"));
  await page.getByLabel("Data evenimentului").fill(futureDate(20));
  await page.getByRole("checkbox", { name: /Accept termenii/ }).check();
  await page.getByRole("button", { name: "Creează evenimentul" }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
  const eventId = page.url().split("/").pop() ?? "";

  await stubCheckoutPage(page);
  await page.getByRole("region", { name: "Activarea pachetului complet" }).getByRole("button", { name: "Plătește și activează" }).click();
  const session = await payFakeSession(await sessionIdFromCheckoutUrl(page));
  expect(await sendWebhook(page, "checkout.session.completed", session)).toBe(200);

  const payment = await latestPayment(eventId);
  expect(payment.status).toBe("paid");
  return { eventId, intent: payment.stripe_payment_intent_id ?? "", amount: payment.amount_minor };
}

async function tokenOf(eventId: string): Promise<string> {
  const { data } = await serviceClient().from("events").select("public_token").eq("id", eventId).single();
  return data?.public_token ?? "";
}

test("rambursarea integrală a activării suspendă evenimentul și oprește uploadul", async ({ page }) => {
  const { eventId, intent, amount } = await paidEvent(page);
  expect(await sendWebhook(page, "charge.refunded", chargeRefunded(intent, amount, amount))).toBe(200);

  await gotoHydrated(page, `/events/${eventId}`);
  await expect(page.getByText("Evenimentul este suspendat")).toBeVisible();
  await gotoHydrated(page, `/e/${await tokenOf(eventId)}`);
  await expect(page.getByRole("status").filter({ hasText: "nu primește momentan fișiere" })).toBeVisible();
  await expect(page.getByLabel("Alege poze și video")).toHaveCount(0);

  const { data: changes } = await serviceClient()
    .from("event_status_changes")
    .select("source, reason, external_ref")
    .eq("event_id", eventId)
    .eq("to_status", "suspended");
  expect(changes).toEqual([{ source: "payment", reason: "Plată rambursată", external_ref: intent }]);
});

test("o rambursare parțială lasă evenimentul activ", async ({ page }) => {
  const { eventId, intent, amount } = await paidEvent(page);
  expect(await sendWebhook(page, "charge.refunded", chargeRefunded(intent, amount, 5_000))).toBe(200);

  await gotoHydrated(page, `/e/${await tokenOf(eventId)}`);
  await expect(page.getByLabel("Alege poze și video")).toBeVisible();
  expect(await latestPayment(eventId)).toMatchObject({ refunded_minor: 5_000, refund_effect: null });
});

/** Stripe în e2e (003): serverul fals (stripe-fake.mjs) și webhook-uri semnate cu secretul de test. */
import { expect, type Page } from "@playwright/test";
import Stripe from "stripe";
import { serviceClient } from "./db";

const FAKE = "http://127.0.0.1:12111";
const signer = new Stripe("sk_test_e2e");

export interface FakeSession {
  id: string;
  url: string | null;
  amount_total: number;
  payment_status: string;
  payment_intent: string | null;
  metadata: Record<string, string>;
  customer_details: unknown;
}

/** Ultima plată a evenimentului, din baza de date. */
export async function latestPayment(eventId: string): Promise<{ id: string; status: string; amount_minor: number; stripe_session_id: string | null }> {
  const { data } = await serviceClient()
    .from("payments")
    .select("id, status, amount_minor, stripe_session_id")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!data) throw new Error("Nicio plată pentru eveniment");
  return data;
}

export async function fakeSession(sessionId: string): Promise<FakeSession> {
  const res = await fetch(`${FAKE}/v1/checkout/sessions/${sessionId}`);
  return (await res.json()) as FakeSession;
}

/** Simulează plata pe pagina Checkout: sesiunea devine plătită (fără webhook). */
export async function payFakeSession(sessionId: string): Promise<FakeSession> {
  const res = await fetch(`${FAKE}/__test/sessions/${sessionId}/pay`, { method: "POST" });
  return (await res.json()) as FakeSession;
}

/** Trimite aplicației un webhook semnat, ca Stripe. */
export async function sendWebhook(page: Page, type: string, object: unknown, id = `evt_${crypto.randomUUID()}`): Promise<number> {
  const payload = JSON.stringify({ id, object: "event", type, api_version: Stripe.API_VERSION, created: Math.floor(Date.now() / 1000), data: { object } });
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const signature = signer.webhooks.generateTestHeaderString({ payload, secret });
  const response = await page.request.post("/api/stripe/webhook", {
    headers: { "stripe-signature": signature, "content-type": "application/json" },
    data: payload,
  });
  return response.status();
}

/**
 * Interceptează pagina găzduită Stripe Checkout (în CI nu există rețea spre Stripe) și întoarce
 * id-ul sesiunii la care a ajuns browserul.
 */
export async function stubCheckoutPage(page: Page): Promise<void> {
  await page.route("https://checkout.stripe.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Stripe Checkout (test)</title><h1>Stripe Checkout (test)</h1>" }),
  );
}

export async function sessionIdFromCheckoutUrl(page: Page): Promise<string> {
  await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_[0-9a-f]+$/);
  return page.url().split("/").pop() ?? "";
}

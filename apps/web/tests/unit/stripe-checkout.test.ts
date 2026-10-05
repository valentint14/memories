import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { billingFromSession } from "../../lib/stripe/billing";
import { checkoutSessionParams, createCheckoutSession, type CheckoutInput } from "../../lib/stripe/checkout";

vi.mock("server-only", () => ({}));

// Parametrii sesiunii Checkout (003: FR-002, FR-003, FR-008, FR-012, FR-012a; contracts/stripe-webhooks.md).
const input: CheckoutInput = {
  paymentId: "11111111-1111-4111-8111-111111111111",
  eventId: "22222222-2222-4222-8222-222222222222",
  eventName: "Nunta Ana și Mihai",
  organizerEmail: "ana@example.test",
  purpose: "activation",
  retentionMonths: 12,
  amountMinor: 39_800,
  expiresAt: "2026-10-03T10:00:00.000Z",
  appUrl: "https://memories.example.ro",
};

describe("checkoutSessionParams", () => {
  const params = checkoutSessionParams(input);

  it("plată unică în lei, cu suma din baza de date și numele evenimentului", () => {
    expect(params.mode).toBe("payment");
    // Platforma e vânzătorul (FR-012), indiferent de setarea Managed Payments a contului.
    expect(params.managed_payments).toEqual({ enabled: false });
    expect(params.line_items).toEqual([
      {
        quantity: 1,
        price_data: {
          currency: "ron",
          unit_amount: 39_800,
          product_data: { name: "Memories — pachet complet, 12 luni", description: "Nunta Ana și Mihai" },
        },
      },
    ]);
  });

  it("cere numele și adresa, oferă firma și CUI-ul, trimite chitanța pe emailul organizatorului", () => {
    expect(params.billing_address_collection).toBe("required");
    expect(params.tax_id_collection).toEqual({ enabled: true });
    expect(params.customer_email).toBe("ana@example.test");
    expect(params.payment_intent_data?.receipt_email).toBe("ana@example.test");
  });

  it("leagă sesiunea de plată și de eveniment, expiră la ora din baza de date, în română", () => {
    const metadata = { payment_id: input.paymentId, event_id: input.eventId, purpose: "activation" };
    expect(params.metadata).toEqual(metadata);
    expect(params.payment_intent_data?.metadata).toEqual(metadata);
    expect(params.expires_at).toBe(Math.floor(Date.parse(input.expiresAt) / 1000));
    expect(params.locale).toBe("ro");
  });

  it("se întoarce pe pagina evenimentului, cu id-ul sesiunii sau „anulata”", () => {
    expect(params.success_url).toBe(`https://memories.example.ro/events/${input.eventId}?plata={CHECKOUT_SESSION_ID}`);
    expect(params.cancel_url).toBe(`https://memories.example.ro/events/${input.eventId}?plata=anulata`);
  });

  it("numește prelungirea altfel", () => {
    const extension = checkoutSessionParams({ ...input, purpose: "retention_extension", amountMinor: 9_900 });
    expect(extension.line_items?.[0]?.price_data?.product_data?.name).toBe("Memories — prelungirea păstrării la 12 luni");
  });
});

describe("createCheckoutSession", () => {
  it("folosește id-ul plății drept cheie de idempotență", async () => {
    const create = vi.fn().mockResolvedValue({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" });
    const fake = { checkout: { sessions: { create } } } as unknown as Stripe;
    const session = await createCheckoutSession(fake, input);
    expect(session).toEqual({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" });
    expect(create).toHaveBeenCalledWith(checkoutSessionParams(input), { idempotencyKey: `checkout-${input.paymentId}` });
  });
});

describe("billingFromSession", () => {
  it("copiază numele, adresa, firma și primul cod fiscal", () => {
    const billing = billingFromSession({
      customer_details: {
        name: "Ana Pop",
        address: { line1: "Str. Florilor 1", line2: null, city: "Cluj-Napoca", postal_code: "400000", state: "CJ", country: "RO" },
        business_name: "Ana SRL",
        tax_ids: [{ type: "ro_tin", value: "RO12345678" }],
      },
    } as unknown as Pick<Stripe.Checkout.Session, "customer_details">);
    expect(billing).toEqual({
      name: "Ana Pop",
      address: { line1: "Str. Florilor 1", line2: null, city: "Cluj-Napoca", postal_code: "400000", state: "CJ", country: "RO" },
      company: "Ana SRL",
      tax_id: "RO12345678",
    });
  });

  it("firma și codul fiscal lipsesc pentru persoanele fizice", () => {
    const billing = billingFromSession({ customer_details: { name: "Ion", address: null } } as unknown as Pick<
      Stripe.Checkout.Session,
      "customer_details"
    >);
    expect(billing).toEqual({ name: "Ion", address: null, company: null, tax_id: null });
  });
});

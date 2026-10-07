import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleWebhookRequest, type WebhookDb } from "../../lib/stripe/webhook";

vi.mock("server-only", () => ({}));

// Webhook-ul Stripe (003: FR-004, FR-006, FR-017; contracts/stripe-webhooks.md).
const SECRET = "whsec_test_unit_secret";
const stripe = new Stripe("sk_test_unit");

function db(overrides: Partial<WebhookDb> = {}): WebhookDb {
  return {
    recordEvent: vi.fn().mockResolvedValue(true),
    finishEvent: vi.fn().mockResolvedValue(undefined),
    completePayment: vi.fn().mockResolvedValue("activated"),
    failPayment: vi.fn().mockResolvedValue(undefined),
    expirePayment: vi.fn().mockResolvedValue(undefined),
    registerDispute: vi.fn().mockResolvedValue("suspended"),
    registerRefund: vi.fn().mockResolvedValue("partial"),
    ...overrides,
  };
}

function event(type: string, object: Record<string, unknown>, id = `evt_${crypto.randomUUID()}`): string {
  return JSON.stringify({ id, object: "event", type, api_version: Stripe.API_VERSION, created: 1, data: { object } });
}

function signed(payload: string, secret = SECRET): Request {
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature, "content-type": "application/json" },
    body: payload,
  });
}

const session = {
  id: "cs_test_1",
  object: "checkout.session",
  payment_status: "paid",
  payment_intent: "pi_1",
  metadata: { payment_id: "11111111-1111-4111-8111-111111111111", event_id: "22222222-2222-4222-8222-222222222222", purpose: "activation" },
  customer_details: {
    name: "Ana Pop",
    email: "ana@example.test",
    address: { line1: "Str. Florilor 1", line2: null, city: "Cluj-Napoca", postal_code: "400000", state: "CJ", country: "RO" },
    business_name: "Ana SRL",
    tax_ids: [{ type: "ro_tin", value: "RO12345678" }],
  },
};

let deps: WebhookDb;
beforeEach(() => {
  deps = db();
});

describe("verificarea cererii", () => {
  it("respinge semnătura lipsă sau invalidă cu 400, fără efecte", async () => {
    const payload = event("checkout.session.completed", session);
    const unsigned = new Request("http://localhost/x", { method: "POST", body: payload });
    expect((await handleWebhookRequest(unsigned, { secret: SECRET, stripe, db: deps })).status).toBe(400);
    expect((await handleWebhookRequest(signed(payload, "whsec_altul"), { secret: SECRET, stripe, db: deps })).status).toBe(400);
    expect(deps.recordEvent).not.toHaveBeenCalled();
    expect(deps.completePayment).not.toHaveBeenCalled();
  });

  it("respinge corpurile peste 1 MB cu 413", async () => {
    const big = "x".repeat(1_048_577);
    const response = await handleWebhookRequest(
      new Request("http://localhost/x", { method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, body: big }),
      { secret: SECRET, stripe, db: deps },
    );
    expect(response.status).toBe(413);
  });

  it("un eveniment deja procesat primește 200 fără alte efecte", async () => {
    deps = db({ recordEvent: vi.fn().mockResolvedValue(false) });
    const response = await handleWebhookRequest(signed(event("checkout.session.completed", session)), { secret: SECRET, stripe, db: deps });
    expect(response.status).toBe(200);
    expect(deps.completePayment).not.toHaveBeenCalled();
    expect(deps.finishEvent).not.toHaveBeenCalled();
  });

  it("un tip necunoscut se marchează „ignored”", async () => {
    const id = "evt_ignored";
    const response = await handleWebhookRequest(signed(event("customer.created", { id: "cus_1" }, id)), { secret: SECRET, stripe, db: deps });
    expect(response.status).toBe(200);
    expect(deps.recordEvent).toHaveBeenCalledWith(id, "customer.created");
    expect(deps.finishEvent).toHaveBeenCalledWith(id, "ignored");
  });

  it("o eroare în tratare dă 500 și lasă evenimentul neterminat (Stripe reîncearcă)", async () => {
    deps = db({ completePayment: vi.fn().mockRejectedValue(new Error("db down")) });
    const response = await handleWebhookRequest(signed(event("checkout.session.completed", session)), { secret: SECRET, stripe, db: deps });
    expect(response.status).toBe(500);
    expect(deps.finishEvent).not.toHaveBeenCalled();
  });
});

describe("plata reușită (US1)", () => {
  it("checkout.session.completed plătit → complete_payment cu sesiunea, intenția și facturarea", async () => {
    const id = "evt_paid";
    const response = await handleWebhookRequest(signed(event("checkout.session.completed", session, id)), { secret: SECRET, stripe, db: deps });
    expect(response.status).toBe(200);
    expect(deps.completePayment).toHaveBeenCalledWith("cs_test_1", "pi_1", {
      name: "Ana Pop",
      address: { line1: "Str. Florilor 1", line2: null, city: "Cluj-Napoca", postal_code: "400000", state: "CJ", country: "RO" },
      company: "Ana SRL",
      tax_id: "RO12345678",
    });
    expect(deps.finishEvent).toHaveBeenCalledWith(id, "activated");
  });

  it("checkout.session.completed neplătit (metodă întârziată) nu face nimic", async () => {
    await handleWebhookRequest(signed(event("checkout.session.completed", { ...session, payment_status: "unpaid" })), {
      secret: SECRET,
      stripe,
      db: deps,
    });
    expect(deps.completePayment).not.toHaveBeenCalled();
  });

  it("checkout.session.async_payment_succeeded → complete_payment", async () => {
    await handleWebhookRequest(signed(event("checkout.session.async_payment_succeeded", session)), { secret: SECRET, stripe, db: deps });
    expect(deps.completePayment).toHaveBeenCalledTimes(1);
  });

  it("o sesiune fără payment_id (alt produs din cont) e ignorată", async () => {
    await handleWebhookRequest(signed(event("checkout.session.completed", { ...session, metadata: {} })), { secret: SECRET, stripe, db: deps });
    expect(deps.completePayment).not.toHaveBeenCalled();
  });
});

describe("plata eșuată sau expirată (US2)", () => {
  it("checkout.session.async_payment_failed → fail_payment", async () => {
    const id = "evt_failed";
    await handleWebhookRequest(signed(event("checkout.session.async_payment_failed", session, id)), { secret: SECRET, stripe, db: deps });
    expect(deps.failPayment).toHaveBeenCalledWith("cs_test_1");
    expect(deps.finishEvent).toHaveBeenCalledWith(id, "failed");
  });

  it("checkout.session.expired → expire_payment", async () => {
    const id = "evt_expired";
    await handleWebhookRequest(signed(event("checkout.session.expired", { ...session, payment_status: "unpaid" }, id)), {
      secret: SECRET,
      stripe,
      db: deps,
    });
    expect(deps.expirePayment).toHaveBeenCalledWith("cs_test_1");
    expect(deps.finishEvent).toHaveBeenCalledWith(id, "expired");
  });
});

describe("contestația (US3)", () => {
  it("charge.dispute.created → register_dispute cu intenția de plată", async () => {
    const id = "evt_dispute";
    await handleWebhookRequest(
      signed(event("charge.dispute.created", { id: "dp_1", object: "dispute", payment_intent: "pi_1", charge: "ch_1" }, id)),
      { secret: SECRET, stripe, db: deps },
    );
    expect(deps.registerDispute).toHaveBeenCalledWith("pi_1");
    expect(deps.finishEvent).toHaveBeenCalledWith(id, "suspended");
  });
});

describe("rambursarea (004)", () => {
  const charge = { id: "ch_1", object: "charge", payment_intent: "pi_1", amount: 29_900, amount_refunded: 29_900, currency: "ron", refunded: true };

  it("charge.refunded → register_refund cu intenția, suma cumulată și momentul evenimentului", async () => {
    const id = "evt_refund";
    deps = db({ registerRefund: vi.fn().mockResolvedValue("suspended") });
    const response = await handleWebhookRequest(signed(event("charge.refunded", charge, id)), { secret: SECRET, stripe, db: deps });
    expect(response.status).toBe(200);
    expect(deps.registerRefund).toHaveBeenCalledWith("pi_1", 29_900, new Date(1_000).toISOString());
    expect(deps.finishEvent).toHaveBeenCalledWith(id, "suspended");
  });

  it("fără intenție de plată sau în altă monedă se marchează „ignored”, fără apel", async () => {
    for (const object of [{ ...charge, payment_intent: null }, { ...charge, currency: "eur" }]) {
      const id = `evt_${crypto.randomUUID()}`;
      await handleWebhookRequest(signed(event("charge.refunded", object, id)), { secret: SECRET, stripe, db: deps });
      expect(deps.finishEvent).toHaveBeenCalledWith(id, "ignored");
    }
    expect(deps.registerRefund).not.toHaveBeenCalled();
  });
});

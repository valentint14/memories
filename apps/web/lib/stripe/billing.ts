import type Stripe from "stripe";

/** Datele de facturare cerute pe pagina de plată (003: FR-012a), copiate în rândul plății. */
export interface Billing {
  name: string | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    postal_code: string | null;
    state: string | null;
    country: string | null;
  } | null;
  company: string | null;
  tax_id: string | null;
}

/** Numele și adresa (obligatorii la Stripe), firma și codul fiscal (opționale), din sesiune. */
export function billingFromSession(session: Pick<Stripe.Checkout.Session, "customer_details">): Billing {
  const details = session.customer_details;
  const address = details?.address ?? null;
  return {
    name: details?.name ?? null,
    address:
      address === null
        ? null
        : {
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            postal_code: address.postal_code,
            state: address.state,
            country: address.country,
          },
    company: details?.business_name ?? null,
    tax_id: details?.tax_ids?.[0]?.value ?? null,
  };
}

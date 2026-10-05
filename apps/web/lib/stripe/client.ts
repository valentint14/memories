import "server-only";
import Stripe from "stripe";
import { serverEnv } from "../server-env";

let client: Stripe | undefined;

/**
 * Clientul Stripe, doar pe server (003, research R2). Versiunea API e fixată la cea a SDK-ului
 * instalat, ca o actualizare a contului Stripe să nu schimbe forma răspunsurilor. În teste,
 * `STRIPE_API_BASE` îl îndreaptă spre stripe-mock (research R9).
 */
export function stripe(): Stripe {
  if (client) return client;
  const base = serverEnv.stripeApiBase;
  client = new Stripe(serverEnv.stripeSecretKey, {
    apiVersion: Stripe.API_VERSION,
    maxNetworkRetries: 2,
    timeout: 10_000,
    appInfo: { name: "Memories" },
    ...(base
      ? {
          host: base.hostname,
          port: base.port === "" ? (base.protocol === "https:" ? 443 : 80) : Number(base.port),
          protocol: base.protocol === "https:" ? "https" : "http",
        }
      : {}),
  });
  return client;
}

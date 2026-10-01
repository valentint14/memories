import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`Lipsește variabila de mediu ${name}`);
  return value;
}

/** Secretele de test Cloudflare Turnstile (trec, eșuează, token folosit) — research R3. */
export const TURNSTILE_TEST_SECRET = /^[123]x0{31}AA$/;

/** Secrete disponibile doar pe server (constituția, principiul III). */
export const serverEnv = {
  get serviceRoleKey(): string {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get appUrl(): string {
    return required("APP_URL");
  },
  get ipHashSecret(): string {
    return required("IP_HASH_SECRET");
  },
  get turnstileSecret(): string {
    return required("TURNSTILE_SECRET_KEY");
  },
  /**
   * Modul fără script extern, doar pentru teste. Acceptat numai cu secretul de test: cu secretul
   * de producție, tokenul de test ar fi oricum respins, dar configurarea greșită e semnalată imediat.
   */
  get turnstileOffline(): boolean {
    if (process.env.TURNSTILE_OFFLINE !== "1") return false;
    if (!TURNSTILE_TEST_SECRET.test(process.env.TURNSTILE_SECRET_KEY ?? "")) {
      throw new Error("TURNSTILE_OFFLINE=1 este permis doar cu secretul de test Turnstile");
    }
    return true;
  },
  /** Antetul cu IP-ul real pus de proxy-ul din față (ex. `cf-connecting-ip`); null = Vercel. */
  get trustedIpHeader(): string | null {
    const value = process.env.TRUSTED_IP_HEADER?.trim().toLowerCase();
    return value === undefined || value === "" ? null : value;
  },
  /**
   * Cheia secretă Stripe (003, research R2). În afara producției se acceptă doar chei de test:
   * o cheie `sk_live_` locală sau în CI ar încasa bani reali (FR-019).
   */
  get stripeSecretKey(): string {
    const key = required("STRIPE_SECRET_KEY");
    if (key.startsWith("sk_live_") && process.env.NODE_ENV !== "production") {
      throw new Error("STRIPE_SECRET_KEY: cheia live Stripe este permisă doar în producție");
    }
    return key;
  },
  /** Secretul de semnare a webhook-urilor Stripe (contracts/stripe-webhooks.md). */
  get stripeWebhookSecret(): string {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  /** Doar teste: adresa stripe-mock (research R9); null = API-ul Stripe real. */
  get stripeApiBase(): URL | null {
    const raw = process.env.STRIPE_API_BASE?.trim();
    return raw === undefined || raw === "" ? null : new URL(raw);
  },
  /** Limita de cereri de email per IP pe oră (FR-036); ridicată doar pe serverul e2e principal. */
  get rateLimitIpPerHour(): number {
    const raw = process.env.RATE_LIMIT_IP_PER_HOUR;
    if (raw === undefined || raw === "") return 20;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) throw new Error("RATE_LIMIT_IP_PER_HOUR trebuie să fie un întreg pozitiv");
    return value;
  },
};

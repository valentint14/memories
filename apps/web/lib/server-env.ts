import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`Lipsește variabila de mediu ${name}`);
  return value;
}

/** Secretul de test Cloudflare Turnstile care acceptă mereu tokenul de test (research R3). */
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

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
    if (process.env.TURNSTILE_SECRET_KEY !== TURNSTILE_TEST_SECRET) {
      throw new Error("TURNSTILE_OFFLINE=1 este permis doar cu secretul de test Turnstile");
    }
    return true;
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

import "server-only";
import { serverEnv } from "../server-env";

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Tokenul produs de sitekey-urile de test Cloudflare. */
export const TURNSTILE_TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

/**
 * Verifică tokenul Cloudflare Turnstile pe server (002: FR-037; research R3). Orice eroare
 * (rețea, răspuns invalid, token lipsă) înseamnă refuz. Tokenul nu se loghează.
 */
export async function verifyTurnstile(token: string | null, ip: string | null): Promise<boolean> {
  if (token === null || token === "") return false;
  // Doar local/CI (modul e permis numai cu secretele de test): răspunsul Cloudflare pentru
  // secretele de test, fără apel de rețea — `1x…` acceptă tokenul de test, celelalte îl resping.
  if (serverEnv.turnstileOffline) {
    return serverEnv.turnstileSecret.startsWith("1x") && token === TURNSTILE_TEST_TOKEN;
  }
  const body = new URLSearchParams({ secret: serverEnv.turnstileSecret, response: token });
  if (ip !== null) body.set("remoteip", ip);
  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: unknown };
    return result.success === true;
  } catch {
    return false;
  }
}

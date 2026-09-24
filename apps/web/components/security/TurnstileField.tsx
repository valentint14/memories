import { headers } from "next/headers";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/server-env";
import { TurnstileWidget } from "./TurnstileWidget";

/** Tokenul de test acceptat de secretul de test Cloudflare (research R3). */
const TEST_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

/**
 * Verificarea anti-bot din formularele publice (002: FR-037). În modul `TURNSTILE_OFFLINE`
 * (doar local/CI, doar cu secretul de test) nu se încarcă scriptul extern: câmpul primește direct
 * tokenul de test, pe care serverul îl verifică la fel ca de obicei.
 */
export async function TurnstileField() {
  if (serverEnv.turnstileOffline) {
    return <input type="hidden" name="cf-turnstile-response" value={TEST_TOKEN} />;
  }
  const nonce = (await headers()).get("x-nonce") ?? "";
  return <TurnstileWidget siteKey={publicEnv.turnstileSiteKey} nonce={nonce} />;
}

import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { serverEnv } from "../server-env";

/** IP-ul clientului: antetul de încredere, altfel prima valoare din `x-forwarded-for` (Vercel) sau `x-real-ip`. */
export async function clientIp(): Promise<string | null> {
  return ipFromHeaders(await headers());
}

/**
 * Cu `TRUSTED_IP_HEADER` (ex. `cf-connecting-ip` în spatele Cloudflare Tunnel) se citește doar acel
 * antet: acolo prima valoare din `x-forwarded-for` vine de la client și poate fi falsificată.
 */
export function ipFromHeaders(h: Headers): string | null {
  const trusted = serverEnv.trustedIpHeader;
  if (trusted !== null) return h.get(trusted)?.trim() || null;
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

/**
 * HMAC al adresei IP cu un secret și data zilei: permite limitarea frecvenței fără a stoca
 * IP-ul în clar (research.md R13); cheia se schimbă zilnic.
 */
export async function hashedClientIp(): Promise<string> {
  const ip = (await clientIp()) ?? "unknown";
  const day = new Date().toISOString().slice(0, 10);
  return createHmac("sha256", serverEnv.ipHashSecret).update(`${day}:${ip}`).digest("hex").slice(0, 32);
}

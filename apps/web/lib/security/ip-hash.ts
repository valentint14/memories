import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { serverEnv } from "../server-env";

/** IP-ul clientului: prima valoare din `x-forwarded-for` (Vercel) sau `x-real-ip`. */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
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

"use server";

import { randomUUID } from "node:crypto";
import { normalizeEmail } from "@memories/shared";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminSupabase } from "../supabase/admin";
import { serverSupabase } from "../supabase/server";
import { serverEnv } from "../server-env";
import { ActionError, runAction, type ActionResult } from "./result";
import { safeNextPath } from "../security/redirect";
import { clientIp, hashedClientIp } from "../security/ip-hash";
import { verifyTurnstile } from "../security/turnstile";
import type { FormState } from "./self-service";

const loginSchema = z.object({
  email: z.string().transform(normalizeEmail).pipe(z.email().max(254)),
  next: z.string().max(200).optional(),
});

/**
 * Autentificarea organizatorilor și administratorilor (002: FR-010, FR-011, FR-036, FR-037):
 * cererea și emailul (trimis de worker doar dacă adresa are cont) urmează același drum pentru
 * orice adresă, apoi pagina de cod. Nu se mai folosește signInWithOtp (research R1).
 */
export async function requestLoginForm(_prev: FormState, formData: FormData): Promise<FormState> {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const values = { email: text("email") };
  const parsed = loginSchema.safeParse({ email: values.email, next: text("next") || undefined });
  if (!parsed.success) return { status: "error", error: "VALIDATION", fields: { email: "validation.email" }, values };
  if (!(await verifyTurnstile(text("cf-turnstile-response"), await clientIp()))) {
    return { status: "error", error: "CAPTCHA_FAILED", values };
  }
  const { data } = await adminSupabase().rpc("request_login", {
    p_email: parsed.data.email,
    p_ip_hash: await hashedClientIp(),
    p_ip_limit: serverEnv.rateLimitIpPerHour,
  });
  const params = new URLSearchParams({ request: data ?? randomUUID() });
  const next = safeNextPath(parsed.data.next);
  if (next) params.set("next", next);
  redirect(`/auth/code?${params.toString()}`);
}

const totpCodeSchema = z.object({
  factorId: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, "INVALID_CODE"),
});

async function requirePlatformAdminUser() {
  const supabase = await serverSupabase();
  const { data: isAdminUser } = await supabase.rpc("is_platform_admin_user");
  if (isAdminUser !== true) throw new ActionError("FORBIDDEN");
  return supabase;
}

export interface TotpEnrollment {
  factorId: string;
  /** Imaginea gata de afișat (`data:image/svg+xml;…`), așa cum o întoarce Supabase. */
  qrCodeDataUrl: string;
  secret: string;
}

/** Înrolează un factor TOTP pentru administrator (FR-006a). Secretul se afișează și ca text. */
export async function enrollTotp(): Promise<ActionResult<TotpEnrollment>> {
  return runAction(z.object({}), {}, async () => {
    const supabase = await requirePlatformAdminUser();
    // Factorii neverificați rămași dintr-o încercare anterioară se elimină.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const factor of factors?.all ?? []) {
      if (factor.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Admin" });
    if (error) throw new ActionError("INTERNAL");
    return { factorId: data.id, qrCodeDataUrl: data.totp.qr_code, secret: data.totp.secret };
  });
}

/** Verifică un cod TOTP și ridică sesiunea la aal2. */
export async function verifyTotp(input: { factorId: string; code: string }): Promise<ActionResult<null>> {
  return runAction(totpCodeSchema, input, async ({ factorId, code }) => {
    const supabase = await requirePlatformAdminUser();
    const { data: user } = await supabase.auth.getUser();
    const key = `totp:${user.user?.id ?? "anon"}`;
    const { data: allowed } = await adminSupabase().rpc("check_rate_limit", {
      p_key: key,
      p_limit: 10,
      p_window: "15 minutes",
    });
    if (allowed !== true) throw new ActionError("RATE_LIMITED");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (error) throw new ActionError("INVALID_CODE");
    return null;
  });
}

export async function signOut(): Promise<void> {
  const supabase = await serverSupabase();
  await supabase.auth.signOut();
}

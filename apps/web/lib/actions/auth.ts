"use server";

import { createHash } from "node:crypto";
import type { ErrorCode } from "@memories/shared";
import { z } from "zod";
import { adminSupabase } from "../supabase/admin";
import { serverSupabase } from "../supabase/server";
import { serverEnv } from "../server-env";
import { ActionError, runAction, type ActionResult } from "./result";
import { safeNextPath } from "../security/redirect";

const magicLinkSchema = z.object({
  email: z.email().max(254),
  next: z.string().max(200).optional(),
});

/**
 * Trimite linkul de autentificare. Răspunsul e întotdeauna `ok`, indiferent dacă adresa are
 * acces (nu dezvăluie clienții); singura eroare vizibilă este RATE_LIMITED (FR-008).
 */
export async function requestMagicLink(input: { email: string; next?: string }): Promise<ActionResult<null>> {
  return runAction(magicLinkSchema, input, async ({ email, next }) => {
    const normalized = email.trim().toLowerCase();
    const key = `login:${createHash("sha256").update(normalized).digest("hex")}`;
    const { data: allowed, error } = await adminSupabase().rpc("check_rate_limit", {
      p_key: key,
      p_limit: 5,
      p_window: "1 hour",
    });
    if (error) throw new ActionError("INTERNAL");
    if (!allowed) throw new ActionError("RATE_LIMITED");

    const supabase = await serverSupabase();
    const redirect = new URL("/auth/confirm", serverEnv.appUrl);
    const nextPath = safeNextPath(next);
    if (nextPath) redirect.searchParams.set("next", nextPath);
    // Eroarea (ex. adresă inexistentă, shouldCreateUser: false) nu se comunică utilizatorului.
    await supabase.auth.signInWithOtp({
      email: normalized,
      options: { shouldCreateUser: false, emailRedirectTo: redirect.toString() },
    });
    return null;
  });
}

export type LoginFormState = { status: "idle" } | { status: "sent" } | { status: "error"; error: ErrorCode };

/** Varianta pentru `<form action>` (useActionState): funcționează și fără JavaScript hidratat. */
export async function requestMagicLinkForm(_prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const email = formData.get("email");
  const next = formData.get("next");
  const result = await requestMagicLink({
    email: typeof email === "string" ? email : "",
    ...(typeof next === "string" && next !== "" ? { next } : {}),
  });
  if (result.ok) return { status: "sent" };
  // O adresă invalidă primește același răspuns neutru; doar limitarea e comunicată.
  return result.error === "RATE_LIMITED" ? { status: "error", error: "RATE_LIMITED" } : { status: "sent" };
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
  qrCodeSvg: string;
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
    return { factorId: data.id, qrCodeSvg: data.totp.qr_code, secret: data.totp.secret };
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

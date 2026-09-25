"use server";

import { randomUUID } from "node:crypto";
import { mapDbError, type ErrorCode } from "@memories/shared";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminSupabase } from "../supabase/admin";
import { serverSupabase } from "../supabase/server";
import { serverEnv } from "../server-env";
import { clientIp, hashedClientIp } from "../security/ip-hash";
import { safeNextPath } from "../security/redirect";
import { verifyTurnstile } from "../security/turnstile";
import { createSelfServiceSchema, isHoneypotFilled } from "../validation/self-service";

/** Starea formularelor native (useActionState): funcționează și înainte de hidratare. */
export type FormState =
  | { status: "idle" }
  | { status: "resent" }
  | {
      status: "error";
      error: ErrorCode;
      fields?: Record<string, string>;
      /**
       * Valorile trimise: React golește formularul nativ după fiecare acțiune, iar la eroare
       * câmpurile le primesc înapoi, ca utilizatorul să nu completeze totul din nou.
       */
      values?: Record<string, string>;
    };

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function codePage(requestId: string, next?: string): string {
  const url = new URLSearchParams({ request: requestId });
  if (next) url.set("next", next);
  return `/auth/code?${url.toString()}`;
}

function fieldErrors(issues: z.core.$ZodIssue[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    fields[issue.path.join(".")] ??= issue.message.startsWith("validation.") ? issue.message : "validation.invalid";
  }
  return fields;
}

/**
 * Formularul de pe pagina principală (002: FR-001–FR-003, FR-036, FR-037; contracts/web-interface.md).
 * După validare și Turnstile, drumul e același pentru orice adresă: o singură funcție SQL, apoi
 * redirecționare la pagina de cod. Limitele depășite și capcana completată duc la un id aleator.
 */
export async function requestEventCreationForm(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = {
    email: text(formData, "email"),
    name: text(formData, "name"),
    eventDate: text(formData, "eventDate"),
    accepted: formData.get("accepted") === "on" ? "on" : "",
  };
  const parsed = createSelfServiceSchema().safeParse({
    email: text(formData, "email"),
    name: text(formData, "name"),
    eventDate: text(formData, "eventDate"),
    termsVersion: text(formData, "termsVersion"),
    privacyVersion: text(formData, "privacyVersion"),
    accepted: formData.get("accepted") ?? undefined,
  });
  if (!parsed.success) return { status: "error", error: "VALIDATION", fields: fieldErrors(parsed.error.issues), values };

  if (!(await verifyTurnstile(text(formData, "cf-turnstile-response"), await clientIp()))) {
    return { status: "error", error: "CAPTCHA_FAILED", values };
  }

  let requestId: string = randomUUID();
  if (!isHoneypotFilled(formData.get("website"))) {
    const input = parsed.data;
    const { data, error } = await adminSupabase().rpc("request_self_service_event", {
      p_email: input.email,
      p_name: input.name,
      p_event_date: input.eventDate,
      p_terms_version: input.termsVersion,
      p_privacy_version: input.privacyVersion,
      p_ip_hash: await hashedClientIp(),
      p_ip_limit: serverEnv.rateLimitIpPerHour,
    });
    if (error) {
      const { code } = mapDbError(error);
      return { status: "error", error: code === "TERMS_OUTDATED" || code === "VALIDATION" ? code : "INTERNAL", values };
    }
    if (data) requestId = data;
  }
  redirect(codePage(requestId));
}

/** După verifyOtp reușit: finalizează cererea și alege pagina următoare (FR-009). */
async function finish(requestId: string | null, next: string | undefined): Promise<never> {
  const supabase = await serverSupabase();
  if (requestId !== null) {
    const { data, error } = await supabase.rpc("complete_auth_request", { p_request_id: requestId });
    if (!error) {
      const row = data[0];
      if (row?.outcome === "confirmed" && row.event_id) redirect(`/events/${row.event_id}`);
      if (row?.outcome === "limit_reached") redirect("/events?limit=1");
    }
  }
  // Administratorii trec întâi prin al doilea factor (001/FR-006a).
  const { data: isAdminUser } = await supabase.rpc("is_platform_admin_user");
  if (isAdminUser === true) redirect("/auth/mfa");
  redirect(next ?? "/events");
}

const codeSchema = z.object({ requestId: z.uuid(), code: z.string().regex(/^\d{6}$/) });

/** Codul introdus pe dispozitivul de pornire (FR-008). */
export async function submitCodeForm(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = codeSchema.safeParse({ requestId: text(formData, "requestId"), code: text(formData, "code").replace(/\s/g, "") });
  if (!parsed.success) return { status: "error", error: "INVALID_CODE" };
  const { requestId, code } = parsed.data;

  const { data: email } = await adminSupabase().rpc("auth_request_email", { p_request_id: requestId });
  if (!email) return { status: "error", error: "REQUEST_EXPIRED" };

  const supabase = await serverSupabase();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) {
    const { data: status } = await adminSupabase().rpc("register_failed_code", { p_request_id: requestId });
    return { status: "error", error: status === "invalidated" ? "REQUEST_INVALIDATED" : "INVALID_CODE" };
  }
  return finish(requestId, safeNextPath(text(formData, "next")));
}

const linkSchema = z.object({ requestId: z.uuid().nullable(), tokenHash: z.string().min(10).max(200) });

/**
 * Butonul de pe pagina deschisă din link (FR-007): tokenul se verifică doar acum, nu la simpla
 * deschidere a paginii. Fără `request`, e un link trimis direct de Supabase Auth (autentificare).
 */
export async function confirmFromLinkForm(_prev: FormState, formData: FormData): Promise<FormState> {
  const requestId = text(formData, "requestId");
  const parsed = linkSchema.safeParse({ requestId: requestId === "" ? null : requestId, tokenHash: text(formData, "tokenHash") });
  if (!parsed.success) return { status: "error", error: "REQUEST_EXPIRED" };

  const supabase = await serverSupabase();
  const { error } = await supabase.auth.verifyOtp({ token_hash: parsed.data.tokenHash, type: "email" });
  if (error) return { status: "error", error: "REQUEST_EXPIRED" };
  return finish(parsed.data.requestId, safeNextPath(text(formData, "next")));
}

/** Un cod nou pentru aceeași cerere, sub aceleași limite (FR-006, FR-036); răspuns neutru. */
export async function resendCodeForm(_prev: FormState, formData: FormData): Promise<FormState> {
  const requestId = text(formData, "requestId");
  let next: string = randomUUID();
  if (z.uuid().safeParse(requestId).success) {
    const { data } = await adminSupabase().rpc("resend_auth_request", {
      p_request_id: requestId,
      p_ip_hash: await hashedClientIp(),
      p_ip_limit: serverEnv.rateLimitIpPerHour,
    });
    if (data) next = data;
  }
  redirect(`${codePage(next, safeNextPath(text(formData, "next")))}&resent=1`);
}

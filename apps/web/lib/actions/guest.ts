"use server";

import { ALLOWED_MIME_TYPES, DISPLAY_NAME_MAX, UPLOAD_GRACE_MINUTES } from "@memories/shared";
import { cookies } from "next/headers";
import { z } from "zod";
import { publicEnv } from "../env";
import { resolveGuestEvent } from "../guest/event";
import { hashedClientIp } from "../security/ip-hash";
import { serverEnv } from "../server-env";
import { adminSupabase } from "../supabase/admin";
import { ActionError, runAction, throwIfDbError, type ActionResult } from "./result";

const COOKIE = "mg_s";
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/);

/** Cookie-ul are calea `/e/{token}`, deci ajunge doar la acțiunile paginii acelui eveniment. */
async function sessionFromCookie(): Promise<string | undefined> {
  const value = (await cookies()).get(COOKIE)?.value;
  return value !== undefined && z.uuid().safeParse(value).success ? value : undefined;
}

const startSchema = z.object({
  token: tokenSchema,
  displayName: z.string().trim().max(DISPLAY_NAME_MAX, "validation.nameTooLong").optional(),
});

/**
 * Creează (sau actualizează) sesiunea anonimă a dispozitivului: cookie httpOnly pe calea
 * evenimentului, valabil până la sfârșitul perioadei + marja de grație (FR-018, research.md R3).
 */
export async function startGuestSession(token: string, displayName?: string): Promise<ActionResult<{ sessionId: string }>> {
  return runAction(startSchema, { token, displayName }, async (input) => {
    const supabase = adminSupabase();
    const existing = await sessionFromCookie();
    if (existing) {
      const { error } = await supabase.rpc("update_guest_name", {
        p_session_id: existing,
        p_token: input.token,
        p_display_name: input.displayName ?? "",
      });
      if (!error) return { sessionId: existing };
      if (error.message !== "SESSION_MISSING") throwIfDbError(error);
    }

    const { data: sessionId, error } = await supabase.rpc("start_guest_session", {
      p_token: input.token,
      p_ip_hash: await hashedClientIp(),
      p_display_name: input.displayName ?? "",
    });
    throwIfDbError(error);
    if (!sessionId) throw new ActionError("INTERNAL");

    const event = await resolveGuestEvent(input.token);
    const expires = event.uploadEndsAt
      ? new Date(new Date(event.uploadEndsAt).getTime() + UPLOAD_GRACE_MINUTES * 60_000)
      : new Date(Date.now() + 24 * 3_600_000);
    (await cookies()).set(COOKIE, sessionId, {
      httpOnly: true,
      // Safari refuză cookie-urile Secure pe http://localhost; în producție APP_URL e https.
      secure: new URL(serverEnv.appUrl).protocol === "https:",
      sameSite: "lax",
      path: `/e/${input.token}`,
      expires,
    });
    return { sessionId };
  });
}

const reserveSchema = z.object({
  token: tokenSchema,
  file: z.object({
    name: z.string().min(1).max(255),
    type: z.enum(ALLOWED_MIME_TYPES, "FILE_TYPE_NOT_ALLOWED"),
    size: z.number().int().positive(),
  }),
  replaceMediaId: z.uuid().optional(),
});

export interface Reservation {
  mediaId: string;
  bucket: "incoming";
  path: string;
  signedToken: string;
  tusEndpoint: string;
  remainingFiles: number;
}

/** Rezervă un fișier și emite tokenul de upload semnat (contracts/web-interface.md). */
export async function reserveUpload(
  token: string,
  file: { name: string; type: string; size: number },
  replaceMediaId?: string,
): Promise<ActionResult<Reservation>> {
  const parsed = reserveSchema.safeParse({ token, file, replaceMediaId });
  if (!parsed.success && parsed.error.issues.some((i) => i.path.join(".") === "file.type")) {
    return { ok: false, error: "FILE_TYPE_NOT_ALLOWED" };
  }
  return runAction(reserveSchema, { token, file, replaceMediaId }, async (input) => {
    const sessionId = await sessionFromCookie();
    if (!sessionId) throw new ActionError("SESSION_MISSING");
    const supabase = adminSupabase();
    const { data, error } = await supabase.rpc("reserve_upload", {
      p_session_id: sessionId,
      p_token: input.token,
      p_filename: input.file.name,
      p_mime: input.file.type,
      p_bytes: input.file.size,
      ...(input.replaceMediaId ? { p_replace_media_id: input.replaceMediaId } : {}),
    });
    throwIfDbError(error);
    const reservation = data?.[0];
    if (!reservation) throw new ActionError("INTERNAL");

    const signed = await supabase.storage.from("incoming").createSignedUploadUrl(reservation.path);
    if (signed.error) throw new ActionError("INTERNAL");
    return {
      mediaId: reservation.media_id,
      bucket: "incoming" as const,
      path: reservation.path,
      signedToken: signed.data.token,
      tusEndpoint: `${publicEnv.supabaseUrl}/storage/v1/upload/resumable/sign`,
      remainingFiles: reservation.remaining,
    };
  });
}

export interface MyUploads {
  uploaded: { mediaId: string; name: string; status: string }[];
  pending: { mediaId: string; name: string }[];
  remainingFiles: number | null;
}

/** Fișierele sesiunii curente — pentru reselectarea după reîncărcarea paginii (FR-016a, FR-022). */
export async function getMyUploads(token: string): Promise<ActionResult<MyUploads>> {
  return runAction(z.object({ token: tokenSchema }), { token }, async () => {
    const sessionId = await sessionFromCookie();
    if (!sessionId) return { uploaded: [], pending: [], remainingFiles: null };
    const supabase = adminSupabase();
    const [uploads, remaining] = await Promise.all([
      supabase.rpc("guest_uploads", { p_session_id: sessionId }),
      supabase.rpc("guest_remaining", { p_session_id: sessionId }),
    ]);
    throwIfDbError(uploads.error);
    const rows = uploads.data ?? [];
    return {
      uploaded: rows
        .filter((r) => r.status !== "reserved")
        .map((r) => ({ mediaId: r.media_id, name: r.name, status: r.status })),
      pending: rows.filter((r) => r.status === "reserved").map((r) => ({ mediaId: r.media_id, name: r.name })),
      remainingFiles: remaining.data ?? null,
    };
  });
}

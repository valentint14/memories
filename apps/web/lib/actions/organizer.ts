"use server";

import { archiveEntryName, mapDbError } from "@memories/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { archiveUrl, latestArchive, requestArchiveJob, type ArchiveState } from "../organizer/archive";
import {
  listGallery,
  mediaUrls,
  requireActiveEvent,
  type GalleryItem,
  type MediaCursor,
  type MediaUrls,
} from "../organizer/media";
import { extendEventRetention, retentionQuote, type RetentionOptionQuote } from "../organizer/retention";
import { serverSupabase } from "../supabase/server";
import { eventBasicsSchema } from "../validation/self-service";
import { runAction, throwIfDbError, type ActionResult } from "./result";
import type { FormState } from "./self-service";

const cursorSchema = z.object({ uploadedAt: z.iso.datetime({ offset: true }), id: z.uuid() });

/** Pagina următoare din galerie sau diferența de la `updatedSince` (contracts/web-interface.md). */
export async function listMedia(
  eventId: string,
  cursor?: MediaCursor,
  updatedSince?: string,
): Promise<ActionResult<{ items: GalleryItem[]; nextCursor: MediaCursor | null }>> {
  return runAction(
    z.object({
      eventId: z.uuid(),
      cursor: cursorSchema.optional(),
      updatedSince: z.iso.datetime({ offset: true }).optional(),
    }),
    { eventId, cursor, updatedSince },
    (input) =>
      listGallery(input.eventId, {
        ...(input.cursor ? { cursor: input.cursor } : {}),
        ...(input.updatedSince ? { updatedSince: input.updatedSince } : {}),
      }),
  );
}

const deleteSchema = z.object({ eventId: z.uuid(), mediaIds: z.array(z.uuid()).min(1).max(500) });

/**
 * Ștergere definitivă (FR-031, FR-032): rândurile devin `deleting`, obiectele se șterg imediat
 * prin Storage API cu sesiunea organizatorului, apoi rândurile dispar. Dacă Storage eșuează,
 * rândurile rămân `deleting` (invizibile) și worker-ul le curăță la reconciliere.
 */
export async function deleteMedia(
  eventId: string,
  mediaIds: string[],
): Promise<ActionResult<{ deleted: string[]; failed: string[] }>> {
  return runAction(deleteSchema, { eventId, mediaIds }, async (input) => {
    const supabase = await requireActiveEvent(input.eventId);
    const { data, error } = await supabase.rpc("delete_media", { p_event_id: input.eventId, p_media_ids: input.mediaIds });
    throwIfDbError(error);
    const marked = data ?? [];
    const paths = marked.flatMap((m) => m.paths);
    if (paths.length > 0) {
      const removed = await supabase.storage.from("media").remove(paths);
      if (!removed.error) {
        await supabase.rpc("finalize_media_deletion", { p_media_ids: marked.map((m) => m.media_id) });
      }
    }
    revalidatePath(`/events/${input.eventId}`);
    const deleted = marked.map((m) => m.media_id);
    return { deleted, failed: input.mediaIds.filter((id) => !deleted.includes(id)) };
  });
}

/** Oferta de prelungire a retenției (US8). */
export async function getRetentionQuote(eventId: string): Promise<ActionResult<RetentionOptionQuote[]>> {
  return runAction(z.object({ eventId: z.uuid() }), { eventId }, (input) => retentionQuote(input.eventId));
}

const extendSchema = z.object({
  eventId: z.uuid(),
  optionId: z.uuid(),
  expectedFinalPriceMinor: z.number().int().nonnegative(),
});

/**
 * Prelungirea retenției la prețul confirmat de organizator. Erori: FORBIDDEN, RETENTION_NOT_LONGER,
 * RETENTION_EXPIRED, PRICE_CHANGED (catalog modificat între timp), OPTION_INACTIVE.
 */
export async function extendRetention(
  eventId: string,
  optionId: string,
  expectedFinalPriceMinor: number,
): Promise<ActionResult<{ finalPriceMinor: number; purgeAt: string }>> {
  return runAction(extendSchema, { eventId, optionId, expectedFinalPriceMinor }, async (input) => {
    const result = await extendEventRetention(input.eventId, input.optionId, input.expectedFinalPriceMinor);
    revalidatePath(`/events/${input.eventId}`);
    revalidatePath("/events");
    return result;
  });
}

/** Numele fișierului descărcat, ca în arhivă (research.md R9). */
function safeDownloadName(row: { original_path: string; guest_name: string | null; uploaded_at: string | null; id: string }): string {
  return archiveEntryName({
    uploadedAt: row.uploaded_at ?? new Date().toISOString(),
    guestName: row.guest_name,
    id: row.id,
    extension: row.original_path.split(".").pop() ?? "bin",
  });
}

/** Cere arhiva ZIP a evenimentului; reutilizează jobul activ (FR-030). */
export async function requestArchive(eventId: string): Promise<ActionResult<ArchiveState>> {
  return runAction(z.object({ eventId: z.uuid() }), { eventId }, (input) => requestArchiveJob(input.eventId));
}

/** Link semnat pentru arhiva gata (`NOT_READY`, `ARCHIVE_EXPIRED`). */
export async function getArchiveUrl(
  archiveJobId: string,
): Promise<ActionResult<{ url: string; fileCount: number; skippedCount: number; expiresAt: string }>> {
  return runAction(z.object({ archiveJobId: z.uuid() }), { archiveJobId }, (input) => archiveUrl(input.archiveJobId));
}

/** Starea curentă a arhivei (rezervă când Realtime nu e disponibil). */
export async function getLatestArchive(eventId: string): Promise<ActionResult<ArchiveState | null>> {
  return runAction(z.object({ eventId: z.uuid() }), { eventId }, (input) => latestArchive(input.eventId));
}

/** URL-uri semnate de 15 min pentru vizualizare și descărcare (FR-028, FR-029, FR-034). */
export async function getMediaUrls(mediaId: string): Promise<ActionResult<MediaUrls>> {
  return runAction(z.object({ mediaId: z.uuid() }), { mediaId }, (input) => mediaUrls(input.mediaId, safeDownloadName));
}

/**
 * Crearea din cont, fără email de confirmare (002: FR-005, FR-021, FR-041). Acceptarea termenilor
 * se cere doar dacă organizatorul nu a acceptat versiunea curentă.
 */
export async function createEventForm(_prev: FormState, formData: FormData): Promise<FormState> {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const parsed = eventBasicsSchema(new Date()).safeParse({ name: text("name"), eventDate: text("eventDate") });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.join(".")] ??= issue.message;
    return { status: "error", error: "VALIDATION", fields };
  }
  const needsTerms = text("termsVersion") !== "";
  if (needsTerms && formData.get("accepted") !== "on") {
    return { status: "error", error: "VALIDATION", fields: { accepted: "validation.acceptTerms" } };
  }

  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc("create_event_as_organizer", {
    p_name: parsed.data.name,
    p_event_date: parsed.data.eventDate,
    ...(needsTerms ? { p_terms_version: text("termsVersion"), p_privacy_version: text("privacyVersion") } : {}),
  });
  if (error) {
    const { code } = mapDbError(error);
    return { status: "error", error: ["AWAITING_LIMIT_REACHED", "TERMS_OUTDATED", "VALIDATION", "FORBIDDEN"].includes(code) ? code : "INTERNAL" };
  }
  revalidatePath("/events");
  redirect(`/events/${data}`);
}

/** Cererea de activare a pachetului complet (002: FR-018a). */
export async function requestActivation(eventId: string): Promise<ActionResult<{ requestedAt: string }>> {
  return runAction(z.object({ eventId: z.uuid() }), { eventId }, async (input) => {
    const supabase = await serverSupabase();
    const { data, error } = await supabase.rpc("request_activation", { p_event_id: input.eventId });
    throwIfDbError(error);
    revalidatePath(`/events/${input.eventId}`);
    return { requestedAt: data ?? new Date().toISOString() };
  });
}

/** Numele și data evenimentului propriu (002: FR-033, FR-034); linkul și codul QR rămân aceleași. */
export async function updateOwnEvent(input: { eventId: string; name: string; eventDate: string }): Promise<ActionResult<null>> {
  return runAction(eventBasicsSchema(new Date()).extend({ eventId: z.uuid() }), input, async ({ eventId, name, eventDate }) => {
    const supabase = await serverSupabase();
    const { error } = await supabase.rpc("organizer_update_event", { p_event_id: eventId, p_name: name, p_event_date: eventDate });
    throwIfDbError(error);
    revalidatePath("/events");
    revalidatePath(`/events/${eventId}`);
    return null;
  });
}

/** Ștergerea definitivă a evenimentului propriu, confirmată prin nume (002: FR-035). */
export async function deleteOwnEvent(input: { eventId: string; confirmName: string }): Promise<ActionResult<null>> {
  return runAction(z.object({ eventId: z.uuid(), confirmName: z.string().max(200) }), input, async ({ eventId, confirmName }) => {
    const supabase = await serverSupabase();
    const { error } = await supabase.rpc("request_event_deletion", { p_event_id: eventId, p_confirm_name: confirmName });
    throwIfDbError(error);
    revalidatePath("/events");
    return null;
  });
}

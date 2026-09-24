"use server";

import { archiveEntryName } from "@memories/shared";
import { revalidatePath } from "next/cache";
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
import { runAction, throwIfDbError, type ActionResult } from "./result";

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

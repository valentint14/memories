"use server";

import { archiveEntryName } from "@memories/shared";
import { z } from "zod";
import { archiveUrl, latestArchive, requestArchiveJob, type ArchiveState } from "../organizer/archive";
import { listGallery, mediaUrls, type GalleryItem, type MediaCursor, type MediaUrls } from "../organizer/media";
import { runAction, type ActionResult } from "./result";

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

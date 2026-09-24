"use server";

import { z } from "zod";
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

/** Numele fișierului descărcat: numele original curățat de caractere periculoase. */
function safeDownloadName(row: { original_path: string; id: string }): string {
  const ext = row.original_path.split(".").pop() ?? "bin";
  return `fisier-${row.id.slice(0, 8)}.${ext}`;
}

/** URL-uri semnate de 15 min pentru vizualizare și descărcare (FR-028, FR-029, FR-034). */
export async function getMediaUrls(mediaId: string): Promise<ActionResult<MediaUrls>> {
  return runAction(z.object({ mediaId: z.uuid() }), { mediaId }, (input) => mediaUrls(input.mediaId, safeDownloadName));
}

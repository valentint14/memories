import "server-only";
import { SIGNED_URL_TTL_SECONDS } from "@memories/shared";
import { ActionError, throwIfDbError } from "../actions/result";
import { serverSupabase } from "../supabase/server";
import type { TypedClient } from "../supabase/types";

export const PAGE_SIZE = 60;

export interface GalleryItem {
  id: string;
  kind: "photo" | "video";
  status: "uploaded" | "processing" | "ready" | "failed";
  guestName: string | null;
  uploadedAt: string;
  updatedAt: string;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

export interface OrganizerEvent {
  id: string;
  name: string | null;
  eventDate: string;
  status: "active" | "expiring" | "expired" | "deleting";
  finalPriceMinor: number | null;
  retentionMonths: number;
  purgeAt: string;
  expiredAt: string | null;
}

/** Evenimentul organizatorului curent (RLS: doar evenimentele sale) sau null. */
export async function getOrganizerEvent(eventId: string, client?: TypedClient): Promise<OrganizerEvent | null> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return null;
  const supabase = client ?? (await serverSupabase());
  const { data, error } = await supabase
    .from("organizer_events")
    .select("id, name, event_date, status, final_price_minor, retention_months, purge_at, expired_at")
    .eq("id", eventId)
    .maybeSingle();
  throwIfDbError(error);
  if (!data?.id || !data.event_date || !data.status || !data.purge_at || data.retention_months === null) return null;
  return {
    id: data.id,
    name: data.name,
    eventDate: data.event_date,
    status: data.status,
    finalPriceMinor: data.final_price_minor,
    retentionMonths: data.retention_months,
    purgeAt: data.purge_at,
    expiredAt: data.expired_at,
  };
}

/** Evenimentul trebuie să fie al organizatorului și activ; altfel FORBIDDEN / EVENT_EXPIRED. */
export async function requireActiveEvent(eventId: string): Promise<TypedClient> {
  const supabase = await serverSupabase();
  const event = await getOrganizerEvent(eventId, supabase);
  if (!event) throw new ActionError("FORBIDDEN");
  if (event.status !== "active") throw new ActionError("EVENT_EXPIRED");
  return supabase;
}

export interface MediaCursor {
  uploadedAt: string;
  id: string;
}

/**
 * O pagină din galerie, ordonată cronologic după momentul încărcării (FR-027), cu URL-uri
 * semnate de 15 minute pentru miniaturi (FR-034). `updatedSince` = resincronizare (FR-033).
 */
export async function listGallery(
  eventId: string,
  opts: { cursor?: MediaCursor; updatedSince?: string } = {},
): Promise<{ items: GalleryItem[]; nextCursor: MediaCursor | null }> {
  const supabase = await requireActiveEvent(eventId);
  let query = supabase
    .from("media_items")
    .select("id, kind, status, guest_name, uploaded_at, updated_at, thumb_path, width, height, duration_ms")
    .eq("event_id", eventId)
    .not("uploaded_at", "is", null)
    .order("uploaded_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(PAGE_SIZE);
  if (opts.cursor) {
    query = query.or(
      `uploaded_at.gt.${opts.cursor.uploadedAt},and(uploaded_at.eq.${opts.cursor.uploadedAt},id.gt.${opts.cursor.id})`,
    );
  }
  if (opts.updatedSince) query = query.gt("updated_at", opts.updatedSince);
  const { data, error } = await query;
  throwIfDbError(error);
  const rows = data ?? [];

  const thumbPaths = rows.map((r) => r.thumb_path).filter((p): p is string => p !== null);
  const signed = new Map<string, string>();
  if (thumbPaths.length > 0) {
    const { data: urls } = await supabase.storage.from("media").createSignedUrls(thumbPaths, SIGNED_URL_TTL_SECONDS);
    for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
  }

  const items = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status as GalleryItem["status"],
    guestName: r.guest_name,
    uploadedAt: r.uploaded_at,
    updatedAt: r.updated_at,
    thumbUrl: r.thumb_path ? (signed.get(r.thumb_path) ?? null) : null,
    width: r.width,
    height: r.height,
    durationMs: r.duration_ms,
  }));
  const last = items.at(-1);
  return {
    items,
    nextCursor: !opts.updatedSince && items.length === PAGE_SIZE && last ? { uploadedAt: last.uploadedAt, id: last.id } : null,
  };
}

/** Numărul fișierelor gata (pentru activarea descărcării în masă, US4-3). */
export async function countReadyFiles(eventId: string): Promise<number> {
  const supabase = await serverSupabase();
  const { count, error } = await supabase
    .from("media_items")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "ready");
  throwIfDbError(error);
  return count ?? 0;
}

export interface MediaUrls {
  kind: "photo" | "video";
  viewUrl: string | null;
  posterUrl: string | null;
  downloadUrl: string;
}

/** URL-uri semnate pentru vizualizare (variantă) și descărcare (original curățat). */
export async function mediaUrls(mediaId: string, downloadName: (row: { original_path: string; guest_name: string | null; uploaded_at: string | null; id: string }) => string): Promise<MediaUrls> {
  const supabase = await serverSupabase();
  const { data: row, error } = await supabase
    .from("media_items")
    .select("id, event_id, kind, status, original_path, display_path, thumb_path, playback_path, guest_name, uploaded_at")
    .eq("id", mediaId)
    .maybeSingle();
  throwIfDbError(error);
  if (!row) throw new ActionError("FORBIDDEN");
  await requireActiveEvent(row.event_id);
  if (row.status !== "ready" || row.original_path === null) throw new ActionError("NOT_READY");

  const viewPath = row.kind === "video" ? row.playback_path : row.display_path;
  const bucket = supabase.storage.from("media");
  const [view, poster, download] = await Promise.all([
    viewPath ? bucket.createSignedUrl(viewPath, SIGNED_URL_TTL_SECONDS) : Promise.resolve(null),
    row.kind === "video" && row.thumb_path ? bucket.createSignedUrl(row.thumb_path, SIGNED_URL_TTL_SECONDS) : Promise.resolve(null),
    bucket.createSignedUrl(row.original_path, SIGNED_URL_TTL_SECONDS, {
      download: downloadName({ original_path: row.original_path, guest_name: row.guest_name, uploaded_at: row.uploaded_at, id: row.id }),
    }),
  ]);
  if (download.error) throw new ActionError("FORBIDDEN");
  return {
    kind: row.kind,
    viewUrl: view?.data?.signedUrl ?? null,
    posterUrl: poster?.data?.signedUrl ?? null,
    downloadUrl: download.data.signedUrl,
  };
}

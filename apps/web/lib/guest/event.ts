import "server-only";
import { adminSupabase } from "../supabase/admin";

export type GuestEventState = "open" | "not_started" | "ended" | "not_found" | "not_activated" | "suspended";

export interface GuestEvent {
  state: GuestEventState;
  eventId: string | null;
  name: string | null;
  uploadStartsAt: string | null;
  uploadEndsAt: string | null;
  purgeAt: string | null;
  maxPhotoBytes: number;
  maxVideoBytes: number;
  maxFilesPerGuest: number;
}

const TOKEN = /^[A-Za-z0-9_-]{22}$/;

/** Starea paginii de upload pentru un token public (FR-020); tokenurile invalide → not_found. */
export async function resolveGuestEvent(token: string): Promise<GuestEvent> {
  const notFound: GuestEvent = {
    state: "not_found",
    eventId: null,
    name: null,
    uploadStartsAt: null,
    uploadEndsAt: null,
    purgeAt: null,
    maxPhotoBytes: 0,
    maxVideoBytes: 0,
    maxFilesPerGuest: 0,
  };
  if (!TOKEN.test(token)) return notFound;
  const supabase = adminSupabase();
  const { data, error } = await supabase.rpc("resolve_event_for_guest", { p_token: token });
  const resolved = data?.[0];
  if (error || !resolved || resolved.state === "not_found") return notFound;
  const { data: limits } = await supabase
    .from("events")
    .select("upload_ends_at, purge_at, max_photo_bytes, max_video_bytes, max_files_per_guest")
    .eq("id", resolved.event_id)
    .single();
  return {
    state: resolved.state as GuestEventState,
    eventId: resolved.event_id,
    name: resolved.name,
    uploadStartsAt: resolved.upload_starts_at,
    uploadEndsAt: limits?.upload_ends_at ?? null,
    purgeAt: limits?.purge_at ?? null,
    maxPhotoBytes: limits?.max_photo_bytes ?? 0,
    maxVideoBytes: limits?.max_video_bytes ?? 0,
    maxFilesPerGuest: limits?.max_files_per_guest ?? 0,
  };
}

/** Plafoanele platformei (FR-001a) și constantele de upload, comune web + worker. */

export const MAX_PHOTO_BYTES = 52_428_800; // 50 MB
export const MAX_VIDEO_BYTES = 1_073_741_824; // 1 GB

export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"] as const;
export const VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime"] as const;
export const ALLOWED_MIME_TYPES = [...PHOTO_MIME_TYPES, ...VIDEO_MIME_TYPES] as const;

export type PhotoMime = (typeof PHOTO_MIME_TYPES)[number];
export type VideoMime = (typeof VIDEO_MIME_TYPES)[number];
export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];
export type MediaKind = "photo" | "video";

/** Chunk TUS fix cerut de Supabase Storage. */
export const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
/** Marja în care uploadurile începute se pot finaliza după închiderea perioadei (FR-021). */
export const UPLOAD_GRACE_MINUTES = 15;
export const DISPLAY_NAME_MAX = 50;
export const EVENT_NAME_MAX = 120;
export const DEFAULT_MAX_FILES_PER_GUEST = 50;
export const MAX_FILES_PER_GUEST_LIMIT = 1000;
export const SIGNED_URL_TTL_SECONDS = 15 * 60;
export const APP_TIME_ZONE = "Europe/Bucharest";

export function isAllowedMime(mime: string): mime is AllowedMime {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

export function kindOfMime(mime: AllowedMime): MediaKind {
  return (VIDEO_MIME_TYPES as readonly string[]).includes(mime) ? "video" : "photo";
}

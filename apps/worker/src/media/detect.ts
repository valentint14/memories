import { fileTypeFromFile } from "file-type";
import { isAllowedMime, kindOfMime, type AllowedMime, type MediaKind } from "@memories/shared";

export type Detection =
  | { ok: true; mime: AllowedMime; kind: MediaKind }
  | { ok: false; reason: "TYPE_NOT_ALLOWED" | "TYPE_MISMATCH" };

/** Tipul real din „magic bytes”, confruntat cu lista permisă și cu tipul declarat (FR-014, FR-017). */
export async function detectType(path: string, declaredKind: MediaKind): Promise<Detection> {
  const detected = await fileTypeFromFile(path);
  if (!detected) return { ok: false, reason: "TYPE_MISMATCH" };
  const mime = detected.mime === "image/heif-sequence" ? "image/heif" : detected.mime;
  if (!isAllowedMime(mime)) return { ok: false, reason: "TYPE_NOT_ALLOWED" };
  const kind = kindOfMime(mime);
  if (kind !== declaredKind) return { ok: false, reason: "TYPE_MISMATCH" };
  return { ok: true, mime, kind };
}

const EXTENSIONS: Record<AllowedMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

export function extensionOf(mime: AllowedMime): string {
  return EXTENSIONS[mime];
}

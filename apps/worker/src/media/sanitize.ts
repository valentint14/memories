import { rm } from "node:fs/promises";
import { exiftool } from "exiftool-vendored";
import type { MediaKind } from "@memories/shared";

/**
 * Elimină metadatele de locație fără re-encodare (research.md R6, FR-023).
 * Poze: se șterg toate metadatele, păstrând doar orientarea și profilul ICC.
 * Video: se șterg grupurile care pot conține locația (GPS, Keys, UserData, ItemList, XMP).
 */
export async function sanitizeInPlace(path: string, kind: MediaKind): Promise<void> {
  // `-m` (ignoreMinorErrors): fișierele trunchiate/corupte se pot curăța totuși; verificarea
  // `hasLocationTags` de după decide dacă fișierul poate fi servit.
  if (kind === "photo") {
    await exiftool.write(path, {}, {
      ignoreMinorErrors: true,
      writeArgs: ["-all=", "-tagsFromFile", "@", "-Orientation", "-ICC_Profile"],
    });
  } else {
    await exiftool.write(path, {}, {
      ignoreMinorErrors: true,
      writeArgs: ["-GPS:all=", "-Keys:all=", "-UserData:all=", "-ItemList:all=", "-XMP:all="],
    });
  }
  // ExifTool păstrează o copie `_original` cu metadatele inițiale; o ștergem imediat.
  await rm(`${path}_original`, { force: true });
}

const LOCATION_TAG = /gps|location|coordinates/i;

/** Verificarea după curățare: niciun tag de locație rămas (SC-009). */
export async function hasLocationTags(path: string): Promise<boolean> {
  const tags = await exiftool.read(path);
  return Object.entries(tags).some(
    ([key, value]) => LOCATION_TAG.test(key) && value !== undefined && value !== null && value !== "",
  );
}

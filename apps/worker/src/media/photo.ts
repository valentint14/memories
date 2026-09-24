import sharp from "sharp";
import type { AllowedMime } from "@memories/shared";
import { decodeHeicToPng } from "./heic.ts";

export interface PhotoVariants {
  display: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

const DISPLAY_SIZE = 2048;
const THUMB_SIZE = 400;
const WEBP = { quality: 80 } as const;

/**
 * Variante WebP cu rotația aplicată (research.md R8). HEIC se decodează întâi cu heif-dec.
 * Întoarce `null` dacă imaginea nu poate fi decodată (fișier corupt → miniatură generică).
 */
export async function makePhotoVariants(path: string, mime: AllowedMime): Promise<PhotoVariants | null> {
  const isHeif = mime === "image/heic" || mime === "image/heif";
  let decoded: Awaited<ReturnType<typeof decodeHeicToPng>> | undefined;
  try {
    decoded = isHeif ? await decodeHeicToPng(path) : undefined;
    const input = decoded?.path ?? path;
    const base = sharp(input, { failOn: "error", limitInputPixels: 268_402_689 }).rotate();

    const display = await base
      .clone()
      .resize({ width: DISPLAY_SIZE, height: DISPLAY_SIZE, fit: "inside", withoutEnlargement: true })
      .webp(WEBP)
      .toBuffer({ resolveWithObject: true });
    const thumb = await base
      .clone()
      .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: "inside", withoutEnlargement: true })
      .webp(WEBP)
      .toBuffer();

    const meta = await sharp(input).metadata();
    const swap = (meta.orientation ?? 1) >= 5;
    return {
      display: display.data,
      thumb,
      width: swap ? meta.height : meta.width,
      height: swap ? meta.width : meta.height,
    };
  } catch {
    return null;
  } finally {
    await decoded?.cleanup();
  }
}

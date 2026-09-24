/**
 * Test de fum pentru imaginea Docker (research.md R5): `heif-dec` decodează un HEIC real, iar
 * sharp produce din rezultat o imagine WebP validă. Eșuează build-ul CI dacă lipsește ceva.
 */
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { decodeHeicToPng } from "../src/media/heic.ts";

const heic = fileURLToPath(new URL("../../../fixtures/media/iphone.heic", import.meta.url));
const png = await decodeHeicToPng(heic);
try {
  const { width, height, format } = await sharp(png.path).webp().toBuffer({ resolveWithObject: true }).then((r) => r.info);
  if (format !== "webp" || width < 100 || height < 100) throw new Error(`rezultat invalid: ${format} ${width}x${height}`);
  console.log(`HEIC OK: ${width}x${height}`);
} finally {
  await png.cleanup();
}

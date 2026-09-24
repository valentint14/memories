/**
 * Transport TUS către Supabase Storage (încărcat dinamic, doar după selectarea fișierelor —
 * LCP, research.md R12). Fișierul merge direct în Storage, fără serverul aplicației (principiul IV).
 */
import { TUS_CHUNK_BYTES, type AllowedMime } from "@memories/shared";
import { Upload } from "tus-js-client";
import type { ReservationResult, Transfer, TransferCallbacks } from "./queue";

export const RETRY_DELAYS = [0, 1000, 3000, 5000, 10000, 20000, 30000];

export function createTusTransfer(
  file: File,
  type: AllowedMime,
  reservation: ReservationResult,
  callbacks: TransferCallbacks,
): Transfer {
  const upload = new Upload(file, {
    endpoint: reservation.tusEndpoint,
    chunkSize: TUS_CHUNK_BYTES,
    retryDelays: RETRY_DELAYS,
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    // Fără reluare între reîncărcări: fișierele nu se păstrează pe telefon (clarificarea Q5).
    storeFingerprintForResuming: false,
    headers: { "x-signature": reservation.signedToken },
    metadata: {
      bucketName: "incoming",
      objectName: reservation.path,
      contentType: type,
      cacheControl: "3600",
    },
    onProgress: (sent, total) => {
      callbacks.onProgress(sent, total);
    },
    onSuccess: () => {
      callbacks.onSuccess();
    },
    onError: (error) => {
      callbacks.onError(error);
    },
  });
  return {
    start: () => {
      upload.start();
    },
    abort: () => upload.abort(),
  };
}

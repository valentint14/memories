"use client";

import { tp } from "@/lib/i18n";

/** Confirmarea finală: câte fișiere s-au încărcat și câte nu (FR-015). */
export function UploadSummary({ done, failed }: { done: number; failed: number }) {
  return (
    <div role="status" className="rounded-lg bg-brand-50 p-4 text-center">
      <p className="text-lg font-semibold">{tp("plural.filesUploaded", done)}</p>
      {failed > 0 && <p className="text-danger">{tp("plural.filesFailed", failed)}</p>}
    </div>
  );
}

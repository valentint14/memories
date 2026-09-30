"use client";

import { tp } from "@/lib/i18n";
import { CheckIcon } from "../ui/icons";

/** Confirmarea finală: câte fișiere s-au încărcat și câte nu (FR-015). */
export function UploadSummary({ done, failed }: { done: number; failed: number }) {
  return (
    <div role="status" className="mt-auto flex flex-col gap-1 border-t border-rule pt-4">
      <p className="flex items-center gap-2 font-serif text-2xl leading-tight">
        <CheckIcon className="size-5 shrink-0 text-success" />
        {tp("plural.filesUploaded", done)}
      </p>
      {failed > 0 && <p className="text-danger">{tp("plural.filesFailed", failed)}</p>}
    </div>
  );
}

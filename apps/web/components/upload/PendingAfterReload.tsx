"use client";

import { useEffect, useState } from "react";
import { getMyUploads, type MyUploads } from "@/lib/actions/guest";
import { t, tp } from "@/lib/i18n";

/**
 * După reîncărcarea paginii (FR-016a): fișierele deja încărcate rămân, iar cele neterminate se
 * afișează după nume, cu posibilitatea de a le reselecta doar pe acestea. Fișierele nu se păstrează
 * în memoria telefonului între reîncărcări.
 */
export function PendingAfterReload({
  token,
  onReselect,
}: {
  token: string;
  onReselect: (files: File[], replaceMediaIds: ReadonlyMap<string, string>) => void;
}) {
  const [state, setState] = useState<MyUploads | null>(null);

  useEffect(() => {
    void getMyUploads(token).then((result) => {
      if (result.ok) setState(result.data);
    });
  }, [token]);

  if (state === null || (state.pending.length === 0 && state.uploaded.length === 0)) return null;

  return (
    <section aria-labelledby="pending-title" className="flex flex-col gap-2 rounded-lg border border-gray-200 p-3">
      <h2 id="pending-title" className="font-semibold">
        {t("upload.previousTitle")}
      </h2>
      {state.uploaded.length > 0 && <p className="text-sm">{tp("plural.filesAlreadyUploaded", state.uploaded.length)}</p>}
      {state.pending.length > 0 && (
        <>
          <p className="text-sm">{t("upload.pendingExplain")}</p>
          <ul className="list-inside list-disc text-sm">
            {state.pending.map((p) => (
              <li key={p.mediaId}>{p.name}</li>
            ))}
          </ul>
          <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border-2 border-brand-600 px-4 font-semibold text-brand-700 focus-within:outline focus-within:outline-3 focus-within:outline-brand-700">
            {t("upload.reselect")}
            <input
              type="file"
              multiple
              accept="image/*,video/*,.heic,.heif,.mov"
              className="sr-only"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length === 0) return;
                const byName = new Map(state.pending.map((p) => [p.name, p.mediaId]));
                onReselect(files, byName);
                const reselected = new Set(files.map((f) => f.name));
                setState({ ...state, pending: state.pending.filter((p) => !reselected.has(p.name)) });
              }}
            />
          </label>
        </>
      )}
    </section>
  );
}

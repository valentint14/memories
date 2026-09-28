"use client";

import { useEffect, useState } from "react";
import { getMyUploads, type MyUploads } from "@/lib/actions/guest";
import { t, tp } from "@/lib/i18n";
import { ui } from "@/lib/ui";

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
    <section aria-labelledby="pending-title" className="flex flex-col gap-3 border-t border-ink pt-3">
      <h2 id="pending-title" className={ui.kicker}>
        {t("upload.previousTitle")}
      </h2>
      {state.uploaded.length > 0 && <p className="text-sm">{tp("plural.filesAlreadyUploaded", state.uploaded.length)}</p>}
      {state.pending.length > 0 && (
        <>
          <p className="text-sm leading-relaxed">{t("upload.pendingExplain")}</p>
          <ul className="flex flex-col border-t border-rule">
            {state.pending.map((p) => (
              <li key={p.mediaId} className={`${ui.data} truncate border-b border-rule py-2 text-sm`}>
                {p.name}
              </li>
            ))}
          </ul>
          <label className={`${ui.buttonSecondary} focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink`}>
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

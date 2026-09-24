"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "react-aria-components";
import { getArchiveUrl, getLatestArchive, requestArchive } from "@/lib/actions/organizer";
import { formatDateTime, t, tp } from "@/lib/i18n";
import type { ArchiveState } from "@/lib/organizer/archive";
import { authorizeRealtime } from "@/lib/realtime/auth";
import { browserSupabase } from "@/lib/supabase/browser";

interface ReadyArchive {
  url: string;
  fileCount: number;
  skippedCount: number;
  expiresAt: string;
}

/**
 * Descărcarea tuturor fișierelor (FR-030): cererea arhivei, anunțul fără reîncărcare când e gata
 * (Realtime pe `archive_jobs`, cu verificare periodică de rezervă) și linkul semnat.
 */
export function ArchivePanel({
  eventId,
  readyFiles,
  initial,
}: {
  eventId: string;
  readyFiles: number;
  initial: ArchiveState | null;
}) {
  const [archive, setArchive] = useState<ArchiveState | null>(initial);
  const [ready, setReady] = useState<ReadyArchive | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async () => {
    const latest = await getLatestArchive(eventId);
    if (latest.ok) setArchive(latest.data);
  }, [eventId]);

  // Realtime: anunțul „arhiva e gata” apare fără reîncărcarea paginii.
  useEffect(() => {
    const supabase = browserSupabase();
    const channel = supabase
      .channel(`archive:${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "archive_jobs", filter: `event_id=eq.${eventId}` },
        () => void refresh(),
      );
    let cancelled = false;
    void authorizeRealtime(supabase).then(() => {
      if (!cancelled) channel.subscribe();
    });
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [eventId, refresh]);

  // O ștergere de fișiere din galerie invalidează arhiva.
  useEffect(() => {
    const onChange = () => void refresh();
    window.addEventListener("gallery:changed", onChange);
    return () => {
      window.removeEventListener("gallery:changed", onChange);
    };
  }, [refresh]);

  // Rezervă: cât timp arhiva se pregătește, verificăm și periodic.
  const inProgress = archive?.status === "pending" || archive?.status === "building";
  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(() => void refresh(), 4000);
    return () => {
      clearInterval(timer);
    };
  }, [inProgress, refresh]);

  useEffect(() => {
    if (archive?.status !== "ready") {
      setReady(null);
      return;
    }
    void getArchiveUrl(archive.jobId).then((result) => {
      if (result.ok) setReady(result.data);
      else if (result.error === "ARCHIVE_EXPIRED") setReady(null);
    });
  }, [archive]);

  const empty = readyFiles === 0;

  return (
    <section aria-labelledby="archive-title" className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4">
      <h2 id="archive-title" className="text-lg font-semibold">
        {t("archive.title")}
      </h2>
      <div aria-live="polite" className="flex flex-col gap-2">
        {empty && <p className="text-muted">{t("archive.empty")}</p>}
        {inProgress && <p>{t("archive.preparing")}</p>}
        {archive?.status === "failed" && <p className="text-danger">{t("archive.failed")}</p>}
        {archive?.status === "expired" && <p className="text-muted">{t("archive.expired")}</p>}
        {ready && (
          <>
            <a
              href={ready.url}
              className="inline-flex min-h-11 self-start items-center rounded-lg bg-brand-600 px-4 font-semibold text-white"
            >
              {t("archive.download", { files: tp("plural.files", ready.fileCount) })}
            </a>
            {ready.skippedCount > 0 && <p className="text-sm">{tp("plural.archiveSkipped", ready.skippedCount)}</p>}
            <p className="text-sm text-muted">{t("archive.validUntil", { date: formatDateTime(ready.expiresAt) })}</p>
          </>
        )}
        {error !== null && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
      {!inProgress && (
        <Button
          isDisabled={empty || pending}
          onPress={() => {
            setError(null);
            startTransition(async () => {
              const result = await requestArchive(eventId);
              if (result.ok) setArchive(result.data);
              else setError(t(`errors.${result.error}`));
            });
          }}
          className="min-h-11 self-start rounded-lg border border-brand-600 px-4 font-semibold text-brand-700 disabled:opacity-50"
        >
          {ready ? t("archive.again") : t("archive.downloadAll")}
        </Button>
      )}
    </section>
  );
}

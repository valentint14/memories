"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { reserveUpload, startGuestSession } from "@/lib/actions/guest";
import { formatBytes, t } from "@/lib/i18n";
import { UploadQueue, type QueueLimits } from "@/lib/upload/queue";
import { ui } from "@/lib/ui";
import { CameraIcon, PlusIcon } from "../ui/icons";
import { FileRow } from "./FileRow";
import { KeepOpenNotice } from "./KeepOpenNotice";
import { NetworkBanner } from "./NetworkBanner";
import { PendingAfterReload } from "./PendingAfterReload";
import { UploadSummary } from "./UploadSummary";

const ACCEPT = "image/*,video/*,.heic,.heif,.mov";

/** Singurul Client Component al paginii invitatului (research.md R12). */
export function UploadClient({
  token,
  limits,
  initialName = "",
  privacy,
}: {
  token: string;
  limits: QueueLimits;
  /** Numele salvat în sesiunea dispozitivului, după o reîncărcare. */
  initialName?: string;
  /** Nota de informare, afișată deasupra butoanelor fixate jos. */
  privacy?: ReactNode;
}) {
  const [name, setName] = useState(initialName);
  const nameRef = useRef(name);
  nameRef.current = name;

  // O singură coadă pe durata paginii: acțiunea care setează cookie-ul de sesiune reîmprospătează
  // componentele de server, iar `limits` primește o identitate nouă — coada nu trebuie recreată.
  const [queue] = useState(
    () =>
      new UploadQueue(
        {
          startSession: (displayName) => startGuestSession(token, displayName === "" ? undefined : displayName),
          reserve: (file, replace) => reserveUpload(token, file, replace),
          createTransfer: async (file, type, reservation, callbacks) => {
            const { createTusTransfer } = await import("@/lib/upload/tus-transfer");
            return createTusTransfer(file, type, reservation, callbacks);
          },
          formatBytes,
        },
        limits,
        () => nameRef.current.trim(),
      ),
  );

  const items = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  // `items` se schimbă la fiecare actualizare a cozii, deci rezumatul e mereu la zi.
  const summary = queue.summary();
  const [offline, setOffline] = useState(false);

  // Pauză la pierderea rețelei, reluare automată la revenire (FR-016).
  useEffect(() => {
    setOffline(!navigator.onLine);
    const onOffline = () => {
      setOffline(true);
      queue.pauseAll();
    };
    const onOnline = () => {
      setOffline(false);
      queue.resumeAll();
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [queue]);

  const onFiles = (files: FileList | null) => {
    if (files && files.length > 0) queue.add(Array.from(files));
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="guest-name" className={ui.label}>
          {t("guest.nameLabel")}
        </label>
        <input
          id="guest-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          maxLength={50}
          autoComplete="name"
          className={ui.input}
        />
      </div>

      <PendingAfterReload
        token={token}
        onReselect={(files, replaceMediaIds) => {
          queue.add(files, replaceMediaIds);
        }}
      />
      <NetworkBanner offline={offline} />

      {items.length > 0 && (
        <section aria-labelledby="files-title" className="flex flex-col">
          <div className="flex items-baseline justify-between border-b border-ink pb-2">
            <h2 id="files-title" className={ui.kicker}>
              {t("guest.filesList")}
            </h2>
            <span className={`${ui.data} text-xs text-ink-muted`}>
              {summary.done} / {items.length}
            </span>
          </div>
          <ul aria-label={t("guest.filesList")} className="flex flex-col">
            {items.map((item) => (
              <FileRow
                key={item.id}
                item={item}
                onRetry={(id) => {
                  queue.retry(id);
                }}
              />
            ))}
          </ul>
          <KeepOpenNotice active={queue.hasActiveUploads()} />
        </section>
      )}

      {items.length > 0 && summary.inProgress === 0 && <UploadSummary done={summary.done} failed={summary.failed} />}

      {privacy}

      {/* Acțiunile principale în treimea de jos a ecranului (FR-036). */}
      <div className="sticky bottom-0 -mx-5 mt-auto flex flex-col gap-2.5 border-t border-rule bg-paper px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3.5">
        <label className={`${ui.buttonPrimaryLarge} focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink`}>
          <PlusIcon />
          {t("guest.pick")}
          <input
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <label className={`${ui.buttonSecondary} focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink`}>
          <CameraIcon />
          {t("guest.camera")}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}

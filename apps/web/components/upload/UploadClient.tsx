"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { reserveUpload, startGuestSession } from "@/lib/actions/guest";
import { formatBytes, t } from "@/lib/i18n";
import { UploadQueue, type QueueLimits } from "@/lib/upload/queue";
import { FileRow } from "./FileRow";
import { UploadSummary } from "./UploadSummary";

const ACCEPT = "image/*,video/*,.heic,.heif,.mov";

/** Singurul Client Component al paginii invitatului (research.md R12). */
export function UploadClient({ token, limits }: { token: string; limits: QueueLimits }) {
  const [name, setName] = useState("");
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

  const onFiles = (files: FileList | null) => {
    if (files && files.length > 0) queue.add(Array.from(files));
  };

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="guest-name" className="font-medium">
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
          className="min-h-11 rounded-lg border border-gray-400 px-3 text-base"
        />
      </div>

      {items.length > 0 && (
        <ul aria-label={t("guest.filesList")} className="flex flex-col gap-2">
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
      )}

      {items.length > 0 && summary.inProgress === 0 && <UploadSummary done={summary.done} failed={summary.failed} />}

      {/* Acțiunile principale în treimea de jos a ecranului (FR-036). */}
      <div className="sticky bottom-0 mt-auto flex flex-col gap-3 bg-white pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <label className="flex min-h-14 cursor-pointer items-center justify-center rounded-xl bg-brand-600 px-4 text-lg font-semibold text-white focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-brand-700">
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
        <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 border-brand-600 px-4 font-semibold text-brand-700 focus-within:outline focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-brand-700">
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

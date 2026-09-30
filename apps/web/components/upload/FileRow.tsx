"use client";

import { t, type MessageKey } from "@/lib/i18n";
import type { QueueItem } from "@/lib/upload/queue";
import { ui } from "@/lib/ui";
import { CheckIcon } from "../ui/icons";

const STATUS_STYLE: Record<QueueItem["status"], string> = {
  queued: "text-ink-muted",
  reserving: "text-ink-muted",
  uploading: "text-ink",
  paused: "text-ink",
  done: "text-success font-medium",
  rejected: "text-danger",
  failed: "text-danger",
};

const BAR_STYLE: Record<QueueItem["status"], string> = {
  queued: "bg-ink",
  reserving: "bg-ink",
  uploading: "bg-ink",
  paused: "bg-ink-muted",
  done: "bg-success",
  rejected: "bg-danger",
  failed: "bg-danger",
};

/** Un rând din registrul de fișiere: nume în mono, linie de progres de 2 px, starea (FR-015). */
export function FileRow({ item, onRetry }: { item: QueueItem; onRetry?: (id: string) => void }) {
  const percent = Math.round(item.progress * 100);
  const statusText =
    item.message !== undefined
      ? t(item.message.key as MessageKey, item.message.params)
      : item.status === "uploading"
        ? t("upload.status.uploading", { percent })
        : t(`upload.status.${item.status}`);

  return (
    <li className="flex flex-col gap-2 border-b border-rule py-3 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <span className={`${ui.data} truncate text-sm`}>{item.name}</span>
        {item.status === "failed" && onRetry && (
          <button
            type="button"
            onClick={() => {
              onRetry(item.id);
            }}
            className={`${ui.buttonText} min-w-11 shrink-0 text-sm`}
          >
            {t("upload.retry")}
          </button>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={item.name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-0.5 bg-rule"
      >
        <div
          className={`h-full transition-[width] ${BAR_STYLE[item.status]}`}
          style={{ width: `${String(item.status === "done" || item.status === "rejected" || item.status === "failed" ? 100 : percent)}%` }}
        />
      </div>
      <p className={`flex items-center gap-1.5 text-sm ${STATUS_STYLE[item.status]}`}>
        {item.status === "done" && <CheckIcon />}
        {statusText}
      </p>
    </li>
  );
}

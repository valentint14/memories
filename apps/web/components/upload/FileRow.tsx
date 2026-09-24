"use client";

import { t, type MessageKey } from "@/lib/i18n";
import type { QueueItem } from "@/lib/upload/queue";

const STATUS_STYLE: Record<QueueItem["status"], string> = {
  queued: "text-muted",
  reserving: "text-muted",
  uploading: "text-ink",
  paused: "text-ink",
  done: "text-success",
  rejected: "text-danger",
  failed: "text-danger",
};

/** Un fișier din coadă: nume, bară de progres și starea (FR-015). */
export function FileRow({ item, onRetry }: { item: QueueItem; onRetry?: (id: string) => void }) {
  const percent = Math.round(item.progress * 100);
  const statusText =
    item.message !== undefined
      ? t(item.message.key as MessageKey, item.message.params)
      : item.status === "uploading"
        ? t("upload.status.uploading", { percent })
        : t(`upload.status.${item.status}`);

  return (
    <li className="flex flex-col gap-1 rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium">{item.name}</span>
        {item.status === "failed" && onRetry && (
          <button
            type="button"
            onClick={() => {
              onRetry(item.id);
            }}
            className="min-h-11 min-w-11 shrink-0 rounded-lg border border-brand-600 px-3 font-semibold text-brand-700"
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
        className="h-2 overflow-hidden rounded-full bg-gray-200"
      >
        <div
          className={`h-full rounded-full transition-[width] ${item.status === "rejected" || item.status === "failed" ? "bg-danger" : "bg-brand-600"}`}
          style={{ width: `${String(item.status === "done" ? 100 : percent)}%` }}
        />
      </div>
      <p className={`text-sm ${STATUS_STYLE[item.status]}`}>{statusText}</p>
    </li>
  );
}

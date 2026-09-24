"use client";

import { useState, useTransition } from "react";
import { Button, GridList, GridListItem } from "react-aria-components";
import { listMedia } from "@/lib/actions/organizer";
import { t } from "@/lib/i18n";
import type { GalleryItem, MediaCursor } from "@/lib/organizer/media";
import { MediaViewer } from "./MediaViewer";

function GenericThumb({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gray-100 p-2 text-center text-xs text-muted">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="m3 16 5-5 4 4 3-3 6 6" />
      </svg>
      {label}
    </div>
  );
}

/** Grila galeriei: miniaturi cronologice, accesibile din tastatură (FR-027, WCAG 2.2). */
export function GalleryGrid({
  eventId,
  initialItems,
  initialCursor,
}: {
  eventId: string;
  initialItems: GalleryItem[];
  initialCursor: MediaCursor | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [loading, startLoading] = useTransition();

  if (items.length === 0) {
    return <p className="text-muted">{t("gallery.empty")}</p>;
  }

  return (
    <>
      <GridList
        aria-label={t("gallery.label")}
        layout="grid"
        items={items}
        onAction={(key) => {
          setOpenIndex(items.findIndex((i) => i.id === key));
        }}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        {(item) => {
          const label = item.guestName ?? t("gallery.anonymousGuest");
          return (
            <GridListItem
              id={item.id}
              textValue={label}
              className="group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border border-gray-200 outline-none data-focus-visible:ring-3 data-focus-visible:ring-brand-600"
            >
              <div className="aspect-square w-full bg-gray-100">
                {item.thumbUrl ? (
                  <img src={item.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <GenericThumb
                    label={item.status === "ready" || item.status === "failed" ? t("gallery.noPreview") : t("gallery.processing")}
                  />
                )}
              </div>
              <div className="flex items-center justify-between gap-2 p-2 text-sm">
                <span className="truncate">{label}</span>
                {item.kind === "video" && <span className="shrink-0 text-muted">{t("gallery.video")}</span>}
              </div>
              {(item.status === "uploaded" || item.status === "processing") && (
                <span className="absolute left-2 top-2 rounded bg-white/90 px-2 py-0.5 text-xs font-medium">
                  {t("gallery.processing")}
                </span>
              )}
            </GridListItem>
          );
        }}
      </GridList>

      {cursor !== null && (
        <Button
          isDisabled={loading}
          onPress={() => {
            startLoading(async () => {
              const result = await listMedia(eventId, cursor);
              if (result.ok) {
                setItems((prev) => [...prev, ...result.data.items]);
                setCursor(result.data.nextCursor);
              }
            });
          }}
          className="min-h-11 self-center rounded-lg border border-brand-600 px-4 font-semibold text-brand-700"
        >
          {t("gallery.loadMore")}
        </Button>
      )}

      <MediaViewer
        items={items}
        index={openIndex}
        onIndexChange={setOpenIndex}
      />
    </>
  );
}

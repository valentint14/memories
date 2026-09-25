"use client";

import { useRef, useState, useTransition } from "react";
import { Button, CheckboxButton, CheckboxField, GridList, GridListItem, type Selection } from "react-aria-components";
import { deleteMedia, listMedia } from "@/lib/actions/organizer";
import { latestUpdatedAt, mergeGallery } from "@/lib/gallery/merge";
import { t, tp } from "@/lib/i18n";
import type { GalleryItem, MediaCursor } from "@/lib/organizer/media";
import { useEventChannel } from "@/lib/realtime/useEventChannel";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
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
  live = true,
}: {
  eventId: string;
  initialItems: GalleryItem[];
  initialCursor: MediaCursor | null;
  /** Fals pentru un eveniment suspendat (002/FR-028a). */
  live?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [loading, startLoading] = useTransition();
  const [selected, setSelected] = useState<Selection>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, startDeleting] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [announcement, setAnnouncement] = useState("");
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Galerie live (FR-033, SC-007): schimbările vin prin Realtime; diferența se cere de la server,
  // cu URL-uri semnate pentru miniaturi, și se integrează fără duplicate.
  const liveStatus = useEventChannel(eventId, {
    onResync: () => {
      const since = latestUpdatedAt(itemsRef.current);
      void listMedia(eventId, undefined, since ?? undefined).then((result) => {
        if (!result.ok || result.data.items.length === 0) return;
        const known = new Set(itemsRef.current.map((i) => i.id));
        const fresh = result.data.items.filter((i) => !known.has(i.id)).length;
        setItems((prev) => mergeGallery(prev, result.data.items, []));
        if (fresh > 0) setAnnouncement(tp("plural.newFiles", fresh));
      });
    },
    onDelete: (id) => {
      setItems((prev) => mergeGallery(prev, [], [id]));
    },
  }, live);

  const selectedIds = selected === "all" ? items.map((i) => i.id) : items.filter((i) => selected.has(i.id)).map((i) => i.id);

  const liveRegion = (
    <>
      <span data-live={liveStatus} hidden />
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );

  if (items.length === 0) {
    return (
      <>
        {liveRegion}
        <p className="text-muted">{t("gallery.empty")}</p>
      </>
    );
  }

  return (
    <>
      {liveRegion}
      <div className="flex min-h-11 flex-wrap items-center gap-3" aria-live="polite">
        {selectedIds.length > 0 && (
          <>
            <Button
              onPress={() => {
                setConfirmOpen(true);
              }}
              className="min-h-11 rounded-lg bg-danger px-4 font-semibold text-white"
            >
              {t("delete.selection", { count: selectedIds.length })}
            </Button>
            <Button
              onPress={() => {
                setSelected(new Set());
              }}
              className="min-h-11 rounded-lg border border-gray-400 px-4"
            >
              {t("delete.clearSelection")}
            </Button>
          </>
        )}
        {deleteError !== null && (
          <p role="alert" className="text-danger">
            {deleteError}
          </p>
        )}
      </div>

      <GridList
        aria-label={t("gallery.label")}
        layout="grid"
        items={items}
        selectionMode="multiple"
        selectedKeys={selected}
        onSelectionChange={setSelected}
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
              <CheckboxField
                slot="selection"
                aria-label={t("delete.select", { name: label })}
                className="absolute right-1 top-1"
              >
                <CheckboxButton className="flex h-11 w-11 cursor-pointer items-center justify-center">
                  {({ isSelected }) => (
                    <span
                      aria-hidden="true"
                      className={`flex h-6 w-6 items-center justify-center rounded border-2 ${isSelected ? "border-brand-600 bg-brand-600 text-white" : "border-gray-500 bg-white/90"}`}
                    >
                      {isSelected ? "✓" : ""}
                    </span>
                  )}
                </CheckboxButton>
              </CheckboxField>
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

      <ConfirmDeleteDialog
        count={selectedIds.length}
        isOpen={confirmOpen}
        pending={deleting}
        onCancel={() => {
          setConfirmOpen(false);
        }}
        onConfirm={() => {
          setDeleteError(null);
          startDeleting(async () => {
            const result = await deleteMedia(eventId, selectedIds);
            setConfirmOpen(false);
            if (!result.ok) {
              setDeleteError(t(`errors.${result.error}`));
              return;
            }
            const gone = new Set(result.data.deleted);
            setItems((prev) => prev.filter((i) => !gone.has(i.id)));
            setSelected(new Set());
            // Panoul de arhivă își reîncarcă starea (arhiva a fost invalidată).
            window.dispatchEvent(new CustomEvent("gallery:changed"));
          });
        }}
      />

      <MediaViewer
        items={items}
        index={openIndex}
        onIndexChange={setOpenIndex}
      />
    </>
  );
}

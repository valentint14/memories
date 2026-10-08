"use client";

import { useRef, useState, useTransition } from "react";
import { Button, CheckboxButton, CheckboxField, GridList, GridListItem, type Selection } from "react-aria-components";
import { countMedia, deleteMedia, listMedia } from "@/lib/actions/organizer";
import { latestUpdatedAt, mergeGallery } from "@/lib/gallery/merge";
import { formatTime, t, tp } from "@/lib/i18n";
import type { GalleryItem, MediaCursor } from "@/lib/organizer/media";
import { useEventChannel } from "@/lib/realtime/useEventChannel";
import { ui } from "@/lib/ui";
import { CheckIcon } from "../ui/icons";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { MediaViewer } from "./MediaViewer";

/** Cadru fără miniatură: contur punctat și eticheta stării, ca un negativ încă nedevelopat. */
function EmptyFrame({ label }: { label: string }) {
  return (
    <div className={`${ui.frameTag} flex h-full w-full items-center justify-center border border-dashed border-field bg-paper-raised text-center text-ink-muted`}>
      {label}
    </div>
  );
}

function duration(ms: number | null): string | null {
  if (ms === null) return null;
  const total = Math.round(ms / 1000);
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Galeria ca foaie de contact (FR-027, WCAG 2.2): cadre cronologice numerotate, cu autorul și ora;
 * selecția e un contur de cerneală, iar ștergerea rămâne singura acțiune în culoarea de pericol.
 */
export function GalleryGrid({
  eventId,
  initialItems,
  initialCursor,
  initialTotal,
  live = true,
}: {
  eventId: string;
  initialItems: GalleryItem[];
  initialCursor: MediaCursor | null;
  /** Toate fișierele din galerie, nu doar pagina încărcată (același număr ca în fișa evenimentului). */
  initialTotal: number;
  /** Fals pentru un eveniment suspendat (002/FR-028a). */
  live?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
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

  // Numărul vine de la server: cu paginare, galeria încărcată nu le conține pe toate.
  const refreshTotal = () => {
    void countMedia(eventId).then((result) => {
      if (result.ok) setTotal(result.data);
    });
  };

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
        if (fresh > 0) {
          setAnnouncement(tp("plural.newFiles", fresh));
          refreshTotal();
        }
      });
    },
    onDelete: (id) => {
      setItems((prev) => mergeGallery(prev, [], [id]));
      refreshTotal();
    },
  }, live);

  const selectedIds = selected === "all" ? items.map((i) => i.id) : items.filter((i) => selected.has(i.id)).map((i) => i.id);
  // Numărul cadrului: poziția în ordinea cronologică a încărcării.
  const frameNumber = new Map(items.map((item, i) => [item.id, String(i + 1).padStart(4, "0")]));

  const liveRegion = (
    <>
      <span data-live={liveStatus} hidden />
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );

  const isLive = live && liveStatus === "subscribed";

  /*
   * Foaia galeriei: o ramă cu o bandă sus și pozele dedesubt. Banda are un singur rând, cu două
   * capete pe aceeași linie de bază: „● Live” în stânga și numărul de fișiere în dreapta; la
   * selecție, ambele capete se înlocuiesc (numărul selectat / Anulează și Șterge). Înălțimea e fixă,
   * ca pozele să nu se miște. Explicația „Live” stă lângă insignă de la `sm`, iar pe telefon sub bandă.
   */
  const sheet = "flex flex-col rounded-xs border border-rule bg-paper-raised";
  const strip = "flex min-h-14 items-center justify-between gap-4 border-b border-rule px-3 sm:px-4";
  // Nota depinde doar de `live` (știut la randare), nu de conexiune: altfel ar împinge pozele în jos
  // la o secundă după afișare, sub degetul organizatorului.
  const hint = live && <p className="px-3 pt-3 text-sm text-ink-muted sm:hidden">{t("gallery.liveHint")}</p>;
  const resting = (
    <>
      {isLive ? (
        <span className="flex items-center gap-3">
          <span className={`${ui.kicker} flex items-center gap-2 text-accent`}>
            <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
            {t("gallery.live")}
          </span>
          <span className="hidden text-sm text-ink-muted sm:inline">{t("gallery.liveHint")}</span>
        </span>
      ) : (
        <span />
      )}
      <span className={`${ui.kicker} text-ink-muted`}>{tp("plural.files", total)}</span>
    </>
  );

  if (items.length === 0) {
    return (
      <section aria-label={t("gallery.label")} className={sheet}>
        {liveRegion}
        <div className={strip}>{resting}</div>
        {hint}
        <p className="px-4 py-10 text-center text-ink-muted">{t("gallery.empty")}</p>
      </section>
    );
  }

  const count = selectedIds.length;
  return (
    <section aria-label={t("gallery.label")} className="flex flex-col gap-4">
      {liveRegion}
      <div className={sheet}>
        <div className={strip} aria-live="polite">
          {count === 0 ? (
            resting
          ) : (
            <>
              <span className={`${ui.kicker} text-ink`}>{t("gallery.selected", { count })}</span>
              <span className="flex items-center gap-4">
                <Button
                  aria-label={t("delete.clearSelection")}
                  onPress={() => {
                    setSelected(new Set());
                  }}
                  className={ui.buttonText}
                >
                  {t("delete.clearSelectionShort")}
                </Button>
                <Button
                  aria-label={t("delete.selection", { count })}
                  onPress={() => {
                    setConfirmOpen(true);
                  }}
                  className={ui.buttonDangerCompact}
                >
                  {t("delete.selectionShort")}
                </Button>
              </span>
            </>
          )}
        </div>
        {deleteError !== null && (
          <p role="alert" className="border-b border-rule px-3 py-2 text-danger sm:px-4">
            {deleteError}
          </p>
        )}
        {hint}

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
          className="grid grid-cols-2 gap-x-3 gap-y-5 p-3 sm:grid-cols-3 sm:gap-x-4 sm:p-4 lg:grid-cols-4"
        >
          {(item) => {
            const label = item.guestName ?? t("gallery.anonymousGuest");
            const length = item.kind === "video" ? duration(item.durationMs) : null;
            return (
              <GridListItem
                id={item.id}
                textValue={label}
                className="group relative flex cursor-pointer flex-col gap-2 outline-none data-focus-visible:outline-2 data-focus-visible:outline-offset-4 data-focus-visible:outline-ink"
              >
                <div className="relative aspect-square w-full bg-rule outline-offset-[3px] group-data-selected:outline-2 group-data-selected:outline-ink">
                  {item.thumbUrl ? (
                    <img src={item.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <EmptyFrame
                      label={item.status === "ready" || item.status === "failed" ? t("gallery.noPreview") : t("gallery.processing")}
                    />
                  )}
                  {item.thumbUrl && (item.status === "uploaded" || item.status === "processing") && (
                    <span className={`${ui.frameTag} absolute left-2 top-2 bg-paper-raised`}>
                      {t("gallery.processing")}
                    </span>
                  )}
                  {item.kind === "video" && (
                    <span className={`${ui.frameTag} absolute bottom-2 left-2 bg-ink text-paper-raised`}>
                      {t("gallery.video")}
                      {length !== null && ` ${length}`}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 text-xs">
                  <span className={`${ui.data} text-accent`}>#{frameNumber.get(item.id)}</span>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <span className={`${ui.data} text-ink-muted`}>{formatTime(item.uploadedAt)}</span>
                </div>
                <CheckboxField slot="selection" aria-label={t("delete.select", { name: label })} className="absolute right-0 top-0">
                  <CheckboxButton className="flex h-11 w-11 cursor-pointer items-center justify-center">
                    {({ isSelected }) => (
                      <span
                        aria-hidden="true"
                        className={`flex size-6 items-center justify-center rounded-xs border-[1.5px] border-ink ${isSelected ? "bg-ink text-paper-raised" : "bg-paper-raised/90"}`}
                      >
                        {isSelected && <CheckIcon className="size-3.5" />}
                      </span>
                    )}
                  </CheckboxButton>
                </CheckboxField>
              </GridListItem>
            );
          }}
        </GridList>
      </div>

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
          className={`${ui.buttonSecondary} self-center`}
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
            refreshTotal();
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
    </section>
  );
}

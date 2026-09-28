"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { getMediaUrls } from "@/lib/actions/organizer";
import { formatTime, t } from "@/lib/i18n";
import type { GalleryItem } from "@/lib/organizer/media";
import { ui } from "@/lib/ui";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "../ui/icons";

type Urls = { viewUrl: string | null; posterUrl: string | null; downloadUrl: string; kind: "photo" | "video" };

/** Vizualizare la dimensiune completă, cu navigare anterior/următor (FR-028). */
export function MediaViewer({
  items,
  index,
  onIndexChange,
}: {
  items: GalleryItem[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
}) {
  const item = index === null ? undefined : items[index];
  const [urls, setUrls] = useState<Urls | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    setUrls(null);
    setError(null);
    void getMediaUrls(item.id).then((result) => {
      if (cancelled) return;
      if (result.ok) setUrls(result.data);
      else setError(t(`errors.${result.error}`));
    });
    return () => {
      cancelled = true;
    };
  }, [item]);

  // Săgețile ← → schimbă fișierul cât timp vizualizarea e deschisă, în afară de controalele video.
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLVideoElement) return;
      if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      if (e.key === "ArrowRight" && index < items.length - 1) onIndexChange(index + 1);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [index, items.length, onIndexChange]);

  if (index === null || !item) return null;
  const label = item.guestName ?? t("gallery.anonymousGuest");
  const hasPrevious = index > 0;
  const hasNext = index < items.length - 1;

  return (
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(open) => {
        if (!open) onIndexChange(null);
      }}
      className="fixed inset-0 z-50 bg-ink"
    >
      {/* Masa luminoasă: fișierul pe tot ecranul, pe cerneală, fără card în jur. */}
      <Modal className="h-full w-full">
        <Dialog className="flex h-dvh flex-col text-paper-raised outline-none">
          <header className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-baseline gap-3">
              <span className={`${ui.data} shrink-0 text-sm text-paper-raised/70`}>#{String(index + 1).padStart(4, "0")}</span>
              <Heading slot="title" className="truncate font-serif text-xl leading-tight sm:text-2xl">
                {label}
              </Heading>
              <span className={`${ui.data} shrink-0 text-sm text-paper-raised/70`}>{formatTime(item.uploadedAt)}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {urls && (
                <a
                  href={urls.downloadUrl}
                  aria-label={t("gallery.download")}
                  className="inline-flex min-h-11 items-center rounded-xs bg-paper-raised px-4 text-sm font-semibold text-ink no-underline"
                >
                  {/* Pe telefon, eticheta scurtă lasă loc numelui invitatului. */}
                  <span className="sm:hidden">{t("gallery.downloadShort")}</span>
                  <span className="hidden sm:inline">{t("gallery.download")}</span>
                </a>
              )}
              <Button
                slot="close"
                aria-label={t("common.close")}
                className="inline-flex size-11 cursor-pointer items-center justify-center rounded-xs border border-paper-raised/40 text-paper-raised hover:border-paper-raised"
              >
                <CloseIcon />
              </Button>
            </div>
          </header>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-20">
            {error !== null && <p className="p-6">{error}</p>}
            {urls?.kind === "photo" && urls.viewUrl && (
              <img src={urls.viewUrl} alt={t("gallery.photoBy", { name: label })} className="h-full w-full object-contain" />
            )}
            {urls?.kind === "video" && urls.viewUrl && (
              <video
                src={urls.viewUrl}
                poster={urls.posterUrl ?? undefined}
                controls
                playsInline
                preload="metadata"
                className="h-full w-full object-contain"
              >
                <track kind="captions" />
              </video>
            )}
            {urls !== null && urls.viewUrl === null && <p className="p-6">{t("gallery.noPreview")}</p>}

            {/* Săgețile lipsesc la capete, în loc să apară dezactivate. */}
            {hasPrevious && (
              <Button
                aria-label={t("gallery.previous")}
                onPress={() => {
                  onIndexChange(index - 1);
                }}
                className={`${arrow} left-2 sm:left-5`}
              >
                <ChevronLeftIcon className="size-6" />
              </Button>
            )}
            {hasNext && (
              <Button
                aria-label={t("gallery.next")}
                onPress={() => {
                  onIndexChange(index + 1);
                }}
                className={`${arrow} right-2 sm:right-5`}
              >
                <ChevronRightIcon className="size-6" />
              </Button>
            )}
          </div>

          <p className={`${ui.data} py-3 text-center text-sm text-paper-raised/70`}>
            {t("gallery.position", { current: index + 1, total: items.length })}
          </p>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

const arrow =
  "absolute top-1/2 inline-flex size-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-paper-raised/40 bg-ink/70 text-paper-raised hover:border-paper-raised";

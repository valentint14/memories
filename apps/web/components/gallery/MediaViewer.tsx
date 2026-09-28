"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { getMediaUrls } from "@/lib/actions/organizer";
import { formatTime, t } from "@/lib/i18n";
import type { GalleryItem } from "@/lib/organizer/media";
import { ui } from "@/lib/ui";

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

  if (index === null || !item) return null;
  const label = item.guestName ?? t("gallery.anonymousGuest");

  return (
    <ModalOverlay
      isOpen
      isDismissable
      onOpenChange={(open) => {
        if (!open) onIndexChange(null);
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-2 sm:p-6"
    >
      <Modal className="flex max-h-full w-full max-w-5xl flex-col rounded-xs border border-ink bg-paper-raised shadow-dialog">
        <Dialog className="flex max-h-[calc(100dvh-1rem)] flex-col gap-3 p-3 outline-none sm:p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-baseline gap-3">
              <span className={`${ui.data} shrink-0 text-sm text-accent`}>#{String(index + 1).padStart(4, "0")}</span>
              <Heading slot="title" className="truncate font-serif text-2xl leading-tight">
                {label}
              </Heading>
              <span className={`${ui.data} shrink-0 text-sm text-ink-muted`}>{formatTime(item.uploadedAt)}</span>
            </div>
            <Button slot="close" className={`${ui.buttonSecondary} shrink-0`}>
              {t("common.close")}
            </Button>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center bg-ink">
            {error !== null && <p className="p-6 text-paper-raised">{error}</p>}
            {urls?.kind === "photo" && urls.viewUrl && (
              <img src={urls.viewUrl} alt={t("gallery.photoBy", { name: label })} className="max-h-[75dvh] w-auto object-contain" />
            )}
            {urls?.kind === "video" && urls.viewUrl && (
              <video
                src={urls.viewUrl}
                poster={urls.posterUrl ?? undefined}
                controls
                playsInline
                preload="metadata"
                className="max-h-[75dvh] w-full"
              >
                <track kind="captions" />
              </video>
            )}
            {urls !== null && urls.viewUrl === null && <p className="p-6 text-paper-raised">{t("gallery.noPreview")}</p>}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              isDisabled={index === 0}
              onPress={() => {
                onIndexChange(index - 1);
              }}
              className={ui.buttonSecondary}
            >
              {t("gallery.previous")}
            </Button>
            {urls && (
              <a href={urls.downloadUrl} className={ui.buttonPrimary}>
                {t("gallery.download")}
              </a>
            )}
            <Button
              isDisabled={index >= items.length - 1}
              onPress={() => {
                onIndexChange(index + 1);
              }}
              className={ui.buttonSecondary}
            >
              {t("gallery.next")}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

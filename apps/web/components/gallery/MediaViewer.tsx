"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { getMediaUrls } from "@/lib/actions/organizer";
import { t } from "@/lib/i18n";
import type { GalleryItem } from "@/lib/organizer/media";

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-6"
    >
      <Modal className="flex max-h-full w-full max-w-5xl flex-col rounded-lg bg-white">
        <Dialog className="flex max-h-[calc(100dvh-1rem)] flex-col gap-3 p-3 outline-none sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <Heading slot="title" className="truncate text-lg font-semibold">
              {label}
            </Heading>
            <Button slot="close" className="min-h-11 min-w-11 rounded-lg border border-gray-300 px-3">
              {t("common.close")}
            </Button>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center bg-gray-900">
            {error !== null && <p className="p-6 text-white">{error}</p>}
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
            {urls !== null && urls.viewUrl === null && <p className="p-6 text-white">{t("gallery.noPreview")}</p>}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              isDisabled={index === 0}
              onPress={() => {
                onIndexChange(index - 1);
              }}
              className="min-h-11 rounded-lg border border-gray-300 px-4 disabled:opacity-40"
            >
              {t("gallery.previous")}
            </Button>
            {urls && (
              <a href={urls.downloadUrl} className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 font-semibold text-white">
                {t("gallery.download")}
              </a>
            )}
            <Button
              isDisabled={index >= items.length - 1}
              onPress={() => {
                onIndexChange(index + 1);
              }}
              className="min-h-11 rounded-lg border border-gray-300 px-4 disabled:opacity-40"
            >
              {t("gallery.next")}
            </Button>
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}

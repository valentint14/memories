import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArchivePanel } from "@/components/gallery/ArchivePanel";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import { RetentionPanel } from "@/components/retention/RetentionPanel";
import { formatDate, t } from "@/lib/i18n";
import { latestArchive } from "@/lib/organizer/archive";
import { countReadyFiles, getOrganizerEvent, listGallery } from "@/lib/organizer/media";
import { retentionQuote } from "@/lib/organizer/retention";

export const metadata: Metadata = { title: "Galerie" };

/** Galeria unui eveniment (FR-027–FR-034). Evenimentele altor organizatori → 404 (FR-009). */
export default async function EventGalleryPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await getOrganizerEvent(eventId);
  if (!event) notFound();

  if (event.status !== "active") {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="text-muted">{formatDate(event.eventDate)}</p>
        <p role="status" className="rounded-lg bg-brand-50 p-4">
          {t("organizer.expiredExplain")}
        </p>
      </div>
    );
  }

  const [first, archive, readyFiles, quote] = await Promise.all([
    listGallery(eventId),
    latestArchive(eventId),
    countReadyFiles(eventId),
    retentionQuote(eventId),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{event.name}</h1>
        <p className="text-muted">{formatDate(event.eventDate)}</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        <RetentionPanel
          eventId={eventId}
          current={{ months: event.retentionMonths, finalPriceMinor: event.finalPriceMinor ?? 0, purgeAt: event.purgeAt }}
          initialOptions={quote}
        />
        <ArchivePanel eventId={eventId} readyFiles={readyFiles} initial={archive} />
      </div>
      <GalleryGrid eventId={eventId} initialItems={first.items} initialCursor={first.nextCursor} />
    </div>
  );
}

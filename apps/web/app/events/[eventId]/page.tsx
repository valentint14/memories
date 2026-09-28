import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArchivePanel } from "@/components/gallery/ArchivePanel";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import { RetentionPanel } from "@/components/retention/RetentionPanel";
import { EventStatusPanel } from "@/components/self-service/EventStatusPanel";
import { ManageEventSection } from "@/components/self-service/ManageEventSection";
import { QrDownloads } from "@/components/self-service/QrDownloads";
import { StatusStamp } from "@/components/ui/StatusStamp";
import { formatDate, t, tp } from "@/lib/i18n";
import { activationInfo } from "@/lib/organizer/activation";
import { latestArchive } from "@/lib/organizer/archive";
import { countReadyFiles, galleryAvailable, getOrganizerEvent, listGallery } from "@/lib/organizer/media";
import { retentionQuote } from "@/lib/organizer/retention";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Galerie" };

/** Antetul evenimentului: firul de navigare, numele în Newsreader, data în mono, starea ca ștampilă. */
function EventHeader({ name, eventDate, status, meta }: { name: string | null; eventDate: string; status: string; meta?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      <p className={`${ui.kicker} text-ink-muted`}>
        <Link href="/events" className="underline decoration-rule underline-offset-4 hover:decoration-ink">
          {t("organizer.myEvents")}
        </Link>
      </p>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <h1 className={ui.pageTitle}>{name}</h1>
        <StatusStamp status={status} />
      </div>
      <p className={`${ui.data} flex flex-wrap gap-x-6 gap-y-1 text-sm`}>
        <span>{formatDate(eventDate)}</span>
        {meta}
      </p>
    </header>
  );
}

/** Galeria unui eveniment (FR-027–FR-034). Evenimentele altor organizatori → 404 (FR-009). */
export default async function EventGalleryPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await getOrganizerEvent(eventId);
  if (!event) notFound();

  if (event.status === "awaiting_activation") {
    const info = await activationInfo(eventId);
    return (
      <div className="flex flex-col gap-8">
        <EventHeader name={event.name} eventDate={event.eventDate} status={event.status} />
        <p role="status" className={ui.notice}>
          {t("organizer.awaitingExplain")}
        </p>
        <div className="grid gap-8 lg:grid-cols-2">
          <EventStatusPanel eventId={eventId} pendingPurgeAt={event.pendingPurgeAt} info={info} />
          <section aria-labelledby="qr-title" className={ui.section}>
            <h2 id="qr-title" className={ui.kicker}>
              {t("admin.detail.links")}
            </h2>
            <QrDownloads eventId={eventId} />
          </section>
        </div>
        {event.name !== null && <ManageEventSection eventId={eventId} name={event.name} eventDate={event.eventDate} canEdit />}
      </div>
    );
  }

  if (!galleryAvailable(event.status) || event.purgeAt === null) {
    return (
      <div className="flex flex-col gap-8">
        <EventHeader name={event.name} eventDate={event.eventDate} status={event.status} />
        <p role="status" className={ui.notice}>
          {t("organizer.expiredExplain")}
        </p>
      </div>
    );
  }

  const [first, archive, readyFiles, quote] = await Promise.all([
    listGallery(eventId),
    latestArchive(eventId),
    countReadyFiles(eventId),
    event.status === "suspended" ? Promise.resolve([]) : retentionQuote(eventId),
  ]);
  const suspended = event.status === "suspended";
  return (
    <div className="flex flex-col gap-8">
      <EventHeader
        name={event.name}
        eventDate={event.eventDate}
        status={event.status}
        meta={<span>{tp("plural.files", readyFiles)}</span>}
      />
      {suspended && (
        <p role="alert" className={ui.alert}>
          {t("organizer.suspendedExplain")}
        </p>
      )}
      {/* Bandă cu două coloane despărțite de o linie, nu două carduri. */}
      <div className="grid border-y border-ink lg:grid-cols-2 [&>*+*]:border-t [&>*+*]:border-rule lg:[&>*+*]:border-t-0 lg:[&>*+*]:border-l lg:[&>*+*]:pl-8 lg:[&>*:not(:last-child)]:pr-8">
        {!suspended && (
          <RetentionPanel
            eventId={eventId}
            current={{ months: event.retentionMonths, finalPriceMinor: event.finalPriceMinor ?? 0, purgeAt: event.purgeAt }}
            initialOptions={quote}
          />
        )}
        <ArchivePanel eventId={eventId} readyFiles={readyFiles} initial={archive} />
      </div>
      <GalleryGrid eventId={eventId} initialItems={first.items} initialCursor={first.nextCursor} live={!suspended} />
      {event.name !== null && (
        <ManageEventSection eventId={eventId} name={event.name} eventDate={event.eventDate} canEdit={!suspended} />
      )}
    </div>
  );
}

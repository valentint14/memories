import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchivePanel } from "@/components/gallery/ArchivePanel";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import { RetentionPanel } from "@/components/retention/RetentionPanel";
import { EventStatusPanel } from "@/components/self-service/EventStatusPanel";
import { ManageEventSection } from "@/components/self-service/ManageEventSection";
import { QrDownloads } from "@/components/self-service/QrDownloads";
import { Sheet } from "@/components/ui/Sheet";
import { StatBand } from "@/components/ui/StatBand";
import { StatusStamp } from "@/components/ui/StatusStamp";
import { formatDateShort, formatDayMonthTime, t, tp } from "@/lib/i18n";
import { activationInfo } from "@/lib/organizer/activation";
import { latestArchive } from "@/lib/organizer/archive";
import { countReadyFiles, galleryAvailable, getOrganizerEvent, listGallery } from "@/lib/organizer/media";
import { retentionQuote } from "@/lib/organizer/retention";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Galerie" };

/**
 * Antetul evenimentului, ca în fișa din administrare: firul de navigare, numele în stânga, starea ca
 * ștampilă în dreapta (pe telefon, pe toată lățimea, dedesubt).
 */
function EventHeader({ name, status }: { name: string | null; status: string }) {
  return (
    <header className="flex flex-col gap-3">
      <p className={`${ui.kicker} text-ink-muted`}>
        <Link href="/events" className="underline decoration-rule underline-offset-4 hover:decoration-ink">
          {t("organizer.myEvents")}
        </Link>
      </p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className={ui.pageTitle}>{name}</h1>
        <span className="grid shrink-0 sm:block">
          <StatusStamp status={status} size="bar" />
        </span>
      </div>
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
    const none = t("admin.detail.none");
    return (
      <div className="flex flex-col gap-6">
        <EventHeader name={event.name} status={event.status} />
        <p role="status" className={ui.notice}>
          {t("organizer.awaitingExplain")}
        </p>
        <StatBand
          label={t("admin.detail.summary")}
          stats={[
            { label: t("admin.detail.stat.eventDate"), value: formatDateShort(event.eventDate) },
            {
              label: t("admin.detail.stat.requested"),
              value: info.lastRequestAt === null ? t("organizer.stat.notRequested") : formatDayMonthTime(info.lastRequestAt),
              accent: info.lastRequestAt !== null,
            },
            { label: t("organizer.stat.uploads"), value: t("organizer.stat.uploadsClosed") },
            {
              label: t("admin.detail.stat.pendingPurge"),
              value: event.pendingPurgeAt === null ? none : formatDateShort(event.pendingPurgeAt),
            },
          ]}
        />
        <div className="grid gap-6 lg:grid-cols-2">
          <EventStatusPanel eventId={eventId} pendingPurgeAt={event.pendingPurgeAt} info={info} />
          <Sheet id="qr-title" title={t("admin.detail.links")}>
            <p className="leading-relaxed">{t("organizer.qrExplain")}</p>
            <div className="mt-auto border-t border-rule pt-4">
              <QrDownloads eventId={eventId} />
            </div>
          </Sheet>
        </div>
        {event.name !== null && <ManageEventSection eventId={eventId} name={event.name} eventDate={event.eventDate} canEdit />}
      </div>
    );
  }

  if (!galleryAvailable(event.status) || event.purgeAt === null) {
    return (
      <div className="flex flex-col gap-6">
        <EventHeader name={event.name} status={event.status} />
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
    <div className="flex flex-col gap-6">
      <EventHeader name={event.name} status={event.status} />
      {suspended && (
        <p role="alert" className={ui.alert}>
          {t("organizer.suspendedExplain")}
        </p>
      )}
      <StatBand
        label={t("admin.detail.summary")}
        stats={[
          { label: t("admin.detail.stat.eventDate"), value: formatDateShort(event.eventDate) },
          { label: t("admin.detail.stat.files"), value: String(readyFiles) },
          { label: t("admin.detail.stat.retention"), value: tp("plural.months", event.retentionMonths) },
          { label: t("admin.detail.stat.purgeAt"), value: formatDateShort(event.purgeAt) },
        ]}
      />
      {/* Păstrarea și arhiva ca foi egale; în suspendare rămâne doar arhiva, pe tot rândul. */}
      <div className="grid gap-6 lg:grid-cols-2">
        {!suspended && (
          <RetentionPanel
            eventId={eventId}
            current={{ months: event.retentionMonths, finalPriceMinor: event.finalPriceMinor ?? 0, purgeAt: event.purgeAt }}
            initialOptions={quote}
          />
        )}
        <div className={`grid ${suspended ? "lg:col-span-2" : ""}`}>
          <ArchivePanel eventId={eventId} readyFiles={readyFiles} initial={archive} />
        </div>
      </div>
      <GalleryGrid eventId={eventId} initialItems={first.items} initialCursor={first.nextCursor} live={!suspended} />
      {event.name !== null && (
        <ManageEventSection eventId={eventId} name={event.name} eventDate={event.eventDate} canEdit={!suspended} />
      )}
    </div>
  );
}

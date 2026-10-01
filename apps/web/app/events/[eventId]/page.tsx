import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArchivePanel } from "@/components/gallery/ArchivePanel";
import { GalleryGrid } from "@/components/gallery/GalleryGrid";
import { RetentionPanel } from "@/components/retention/RetentionPanel";
import { EventStatusPanel } from "@/components/self-service/EventStatusPanel";
import { ManageEventSection } from "@/components/self-service/ManageEventSection";
import { PaymentStatus } from "@/components/self-service/PaymentStatus";
import { UploadLinkSheet } from "@/components/self-service/UploadLinkSheet";
import { StatBand } from "@/components/ui/StatBand";
import { StatusStamp } from "@/components/ui/StatusStamp";
import { formatDateShort, formatDateTime, t, tp } from "@/lib/i18n";
import { activationInfo } from "@/lib/organizer/activation";
import { confirmReturnedSession } from "@/lib/stripe/return";
import { serverSupabase } from "@/lib/supabase/server";
import { latestArchive } from "@/lib/organizer/archive";
import { countReadyFiles, galleryAvailable, getOrganizerEvent, listGallery } from "@/lib/organizer/media";
import { uploadUrlForOrganizer } from "@/lib/organizer/qr";
import { retentionQuote } from "@/lib/organizer/retention";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Galerie" };

/**
 * Antetul evenimentului: numele în stânga, starea ca ștampilă în dreapta (pe telefon, numele
 * centrat și ștampila pe toată lățimea, dedesubt). De la `sm`, titlul e tăiat la majuscule și la linia de bază, iar ștampila
 * (40 px) coboară cu 4 px, ca să stea centrată pe literele ultimului rând (majuscule de 32 px).
 */
function EventHeader({ name, status }: { name: string | null; status: string }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <h1 className={`${ui.pageTitle} text-center sm:text-left sm:[text-box:trim-both_cap_alphabetic]`}>{name}</h1>
      <span className="grid shrink-0 sm:-mb-1 sm:block">
        <StatusStamp status={status} size="bar" />
      </span>
    </header>
  );
}

/** Galeria unui eveniment (FR-027–FR-034). Evenimentele altor organizatori → 404 (FR-009). */
export default async function EventGalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ plata?: string }>;
}) {
  const { eventId } = await params;
  const { plata } = await searchParams;
  // Întoarcerea din Stripe Checkout: sesiunea se verifică direct la Stripe (003: FR-004, research R3).
  const returnedSession = plata !== undefined && plata !== "anulata" ? plata : null;
  if (returnedSession !== null) await confirmReturnedSession(eventId, returnedSession);
  const event = await getOrganizerEvent(eventId);
  if (!event) notFound();

  if (event.status === "awaiting_activation") {
    const [info, uploadUrl] = await Promise.all([activationInfo(eventId), uploadUrlForOrganizer(eventId)]);
    const none = t("admin.detail.none");
    // FR-009: „se confirmă” după întoarcerea cu plata neconfirmată încă; „nu a reușit” după anulare sau eșec.
    const paymentNotice =
      plata === "anulata" || info.payment?.status === "failed" ? "failed" : returnedSession !== null ? "confirming" : null;
    return (
      <div className="flex flex-col gap-6">
        <EventHeader name={event.name} status={event.status} />
        {paymentNotice !== null && <PaymentStatus eventId={eventId} notice={paymentNotice} />}
        <p role="status" className={ui.notice}>
          {t("organizer.awaitingExplain")}
        </p>
        <StatBand
          label={t("admin.detail.summary")}
          stats={[
            { label: t("admin.detail.stat.eventDate"), value: formatDateShort(event.eventDate) },
            {
              label: t("organizer.stat.payment"),
              value: info.payment?.status === "open" ? t("organizer.stat.paymentOpen") : t("organizer.stat.unpaid"),
              accent: info.payment?.status === "open",
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
          {/* Până la activare, invitații care deschid linkul văd că încărcarea nu e încă deschisă. */}
          <UploadLinkSheet eventId={eventId} uploadUrl={uploadUrl} explain="organizer.qrExplain" />
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

  const suspended = event.status === "suspended";
  const [first, archive, readyFiles, quote, uploadUrl, payment] = await Promise.all([
    listGallery(eventId),
    latestArchive(eventId),
    countReadyFiles(eventId),
    suspended ? Promise.resolve([]) : retentionQuote(eventId),
    // În suspendare invitații nu pot încărca: linkul și codul QR nu se mai arată.
    suspended ? Promise.resolve(null) : uploadUrlForOrganizer(eventId),
    lastPayment(eventId),
  ]);
  const paidAt = payment?.status === "paid" ? payment.paidAt : null;
  // Întoarcerea din plata unei prelungiri (003: FR-009, FR-020).
  const extensionNotice =
    plata === "anulata" ? "failed" : returnedSession !== null && payment?.status === "open" ? "confirming" : null;
  return (
    <div className="flex flex-col gap-6">
      <EventHeader name={event.name} status={event.status} />
      {suspended && (
        <p role="alert" className={ui.alert}>
          {t("organizer.suspendedExplain")}
        </p>
      )}
      {extensionNotice !== null && <PaymentStatus eventId={eventId} notice={extensionNotice} />}
      {paidAt !== null && extensionNotice === null && (
        <p role="status" className={ui.notice}>
          {t("payment.received", { date: formatDateTime(paidAt) })}
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
      {/*
        Rândurile: galeria; arhiva; păstrarea și linkul cu codul QR (foi egale); apoi detaliile și
        ștergerea. În suspendare nu mai apar păstrarea și linkul.
      */}
      <GalleryGrid eventId={eventId} initialItems={first.items} initialCursor={first.nextCursor} live={!suspended} />
      <ArchivePanel eventId={eventId} readyFiles={readyFiles} initial={archive} />
      {uploadUrl !== null && (
        <div className="grid gap-6 lg:grid-cols-2">
          <RetentionPanel
            eventId={eventId}
            current={{ months: event.retentionMonths, finalPriceMinor: event.finalPriceMinor ?? 0, purgeAt: event.purgeAt }}
            initialOptions={quote}
          />
          <UploadLinkSheet eventId={eventId} uploadUrl={uploadUrl} explain="organizer.qrExplainActive" />
        </div>
      )}
      {event.name !== null && (
        <ManageEventSection eventId={eventId} name={event.name} eventDate={event.eventDate} canEdit={!suspended} />
      )}
    </div>
  );
}

/** Ultima plată a evenimentului (banda „Plată primită” și mesajele de după întoarcere, 003: FR-009). */
async function lastPayment(eventId: string): Promise<{ status: string; paidAt: string | null } | null> {
  const supabase = await serverSupabase();
  const { data } = await supabase.rpc("organizer_payment_state", { p_event_id: eventId });
  const last = data?.[0];
  return last ? { status: last.status, paidAt: last.paid_at } : null;
}

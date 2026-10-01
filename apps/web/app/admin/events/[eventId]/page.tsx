import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeleteEventDialog } from "@/components/admin/DeleteEventDialog";
import { EventForm } from "@/components/admin/EventForm";
import { EventStateActions } from "@/components/admin/EventStateActions";
import { PaymentsSheet } from "@/components/admin/PaymentsSheet";
import { PendingEventForm } from "@/components/admin/PendingEventForm";
import { StatusHistory } from "@/components/admin/StatusHistory";
import { Sheet } from "@/components/ui/Sheet";
import { SheetActions } from "@/components/ui/SheetActions";
import { StatBand } from "@/components/ui/StatBand";
import { StatusStamp } from "@/components/ui/StatusStamp";
import { getEvent, listActiveRetentionOptions, listPayments, listRetentionChanges, listStatusChanges } from "@/lib/admin/queries";
import { formatBytes, formatDateShort, formatDateTime, formatMoney, t, tp, type MessageKey } from "@/lib/i18n";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Eveniment" };

export default async function AdminEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) notFound();
  const event = await getEvent(eventId);
  if (!event) notFound();
  const [options, history, statusChanges, payments] = await Promise.all([
    listActiveRetentionOptions(),
    listRetentionChanges(eventId),
    listStatusChanges(eventId),
    listPayments(eventId),
  ]);
  const lastPaid = payments.find((p) => p.status === "paid" && p.paidAt !== null)?.paidAt ?? null;

  // Opțiunea curentă rămâne în listă chiar dacă între timp a fost dezactivată.
  const formOptions =
    event.retentionOptionId === null || options.some((o) => o.id === event.retentionOptionId)
      ? options
      : [
          ...options,
          {
            id: event.retentionOptionId,
            months: event.retentionMonths,
            surchargeMinor: event.finalPriceMinor - (event.basePriceMinor ?? 0),
            active: false,
          },
        ];

  const title = event.name ?? t("admin.anonymizedEvent");
  const activated = event.status !== "awaiting_activation";
  const none = t("admin.detail.none");
  const linkActive = event.status === "active" || event.status === "awaiting_activation" || event.status === "suspended";
  // Formularul complet de editare: doar pentru evenimentele active, cu toate câmpurile comerciale.
  const editInitial =
    event.status === "active" &&
    event.name !== null &&
    event.organizerEmail !== null &&
    event.uploadStartsAt !== null &&
    event.uploadEndsAt !== null &&
    event.basePriceMinor !== null &&
    event.retentionOptionId !== null
      ? {
          eventId: event.id,
          name: event.name,
          eventDate: event.eventDate,
          organizerEmail: event.organizerEmail,
          uploadStartsAt: event.uploadStartsAt,
          uploadEndsAt: event.uploadEndsAt,
          maxFilesPerGuest: event.maxFilesPerGuest,
          maxPhotoBytes: event.maxPhotoBytes,
          maxVideoBytes: event.maxVideoBytes,
          basePriceMinor: event.basePriceMinor,
          retentionOptionId: event.retentionOptionId,
        }
      : null;

  // Banda cu patru cifre: pentru un eveniment activat, ce s-a încărcat și cât costă; pentru unul
  // neactivat, momentele care contează până la activare.
  const stats: { label: MessageKey; value: string; accent?: boolean }[] = activated
    ? [
        { label: "admin.detail.stat.files", value: `${String(event.fileCount)} · ${formatBytes(event.totalBytes)}` },
        { label: "admin.detail.stat.price", value: formatMoney(event.finalPriceMinor) },
        { label: "admin.detail.stat.retention", value: tp("plural.months", event.retentionMonths) },
        { label: "admin.detail.stat.purgeAt", value: event.purgeAt === null ? none : formatDateShort(event.purgeAt) },
      ]
    : [
        { label: "admin.detail.stat.eventDate", value: formatDateShort(event.eventDate) },
        { label: "admin.detail.stat.created", value: formatDateShort(event.createdAt) },
        {
          label: "admin.detail.stat.payment",
          value: payments.some((p) => p.status === "open") ? t("organizer.stat.paymentOpen") : t("organizer.stat.unpaid"),
          accent: payments.some((p) => p.status === "open"),
        },
        { label: "admin.detail.stat.pendingPurge", value: event.pendingPurgeAt === null ? none : formatDateShort(event.pendingPurgeAt) },
      ];

  return (
    <div className="flex flex-col gap-6">
      {/* Antetul: numele și organizatorul în stânga, starea și acțiunea ei în dreapta. */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className={ui.pageTitle}>{title}</h1>
          <p className={`${ui.data} text-sm break-all text-ink-muted`}>
            {t(`admin.origin.${event.origin}`)}
            {event.organizerEmail !== null && <> · {event.organizerEmail}</>}
          </p>
        </div>
        {/* Pe telefon: ștampila și acțiunea pe toată lățimea, una sub alta; pe ecrane late, pe un rând. */}
        <div className="grid shrink-0 gap-2 sm:flex sm:items-center sm:gap-3 [&_button]:w-full sm:[&_button]:w-auto">
          <span data-testid="event-status" className="grid sm:block">
            <StatusStamp status={event.status} prefix="admin.status" size="bar" />
          </span>
          <EventStateActions eventId={event.id} subject={{ name: title, organizerEmail: event.organizerEmail }} status={event.status} />
        </div>
      </header>

      {lastPaid !== null && (
        <p role="status" className={ui.notice}>
          {t("admin.payments.lastPaid", { date: formatDateTime(lastPaid) })}
        </p>
      )}

      <StatBand label={t("admin.detail.summary")} stats={stats.map((s) => ({ ...s, label: t(s.label) }))} />

      {/*
        Fiecare foaie pe rândul ei: istoricele cresc în timp, iar o foaie scurtă alături s-ar întinde
        cât ele. Linkul are descărcările în dreapta de la `lg`, ca pe pagina organizatorului.
      */}
      <div className="flex flex-col gap-6">
        <Sheet id="links-title" title={t("admin.detail.links")}>
          {linkActive ? (
            <div className="grid gap-4 lg:grid-cols-2 lg:items-center lg:gap-6">
              <p className="flex flex-col gap-1">
                <span className="text-sm text-ink-muted">{t("admin.detail.uploadUrl")}</span>
                <a href={event.uploadUrl} data-testid="upload-url" className={`${ui.link} ${ui.data} text-sm break-all`}>
                  {event.uploadUrl}
                </a>
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <a href={`/admin/events/${event.id}/qr.png`} download className={ui.buttonSecondary}>
                  {t("admin.detail.downloadPng")}
                </a>
                <a href={`/admin/events/${event.id}/qr.svg`} download className={ui.buttonSecondary}>
                  {t("admin.detail.downloadSvg")}
                </a>
              </div>
            </div>
          ) : (
            <p className="text-ink-muted">{t("admin.detail.linkInactive")}</p>
          )}
        </Sheet>

        {event.status === "awaiting_activation" && event.name !== null && (
          <Sheet id="pending-edit-title" title={t("admin.detail.edit")}>
            <PendingEventForm eventId={event.id} name={event.name} eventDate={event.eventDate} />
          </Sheet>
        )}

        {editInitial !== null && (
          <Sheet id="edit-title" title={t("admin.detail.edit")}>
            <EventForm fill options={formOptions} initial={editInitial} />
          </Sheet>
        )}

        <PaymentsSheet payments={payments} />

        <Sheet id="status-history-title" title={t("admin.statusHistory.title")}>
          <StatusHistory rows={statusChanges} />
        </Sheet>

        <Sheet id="history-title" title={t("admin.history.title")}>
          {history.length === 0 ? (
            <p className="text-ink-muted">{t("admin.history.empty")}</p>
          ) : (
            <ol aria-label={t("admin.history.title")} className="flex flex-col">
              {history.map((h) => (
                <li
                  key={`${h.at}-${String(h.toMonths)}`}
                  className="flex flex-col gap-0.5 border-b border-rule py-3 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <span className={`${ui.data} text-xs text-ink-muted`}>{formatDateTime(h.at)}</span>
                  <span>
                    {h.fromMonths === null ? "" : `${tp("plural.months", h.fromMonths)} → `}
                    {tp("plural.months", h.toMonths)}
                    <span className={ui.data}>
                      {" · "}
                      {h.fromFinalPriceMinor === null ? "" : `${formatMoney(h.fromFinalPriceMinor)} → `}
                      {formatMoney(h.toFinalPriceMinor)}
                    </span>
                  </span>
                  <span className="text-sm text-ink-muted">
                    {t(`admin.actor.${h.actorKind}`)} · {t("admin.history.purgeLine", { date: formatDateShort(h.toPurgeAt) })}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Sheet>

        <Sheet id="danger-title" title={t("admin.delete.section")} danger>
          <p>{t("admin.delete.explain")}</p>
          <SheetActions>
            <DeleteEventDialog eventId={event.id} eventName={event.name} />
          </SheetActions>
        </Sheet>
      </div>
    </div>
  );
}

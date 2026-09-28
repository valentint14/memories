import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeleteEventDialog } from "@/components/admin/DeleteEventDialog";
import { EventForm } from "@/components/admin/EventForm";
import { EventStateActions } from "@/components/admin/EventStateActions";
import { PendingEventForm } from "@/components/admin/PendingEventForm";
import { StatusHistory } from "@/components/admin/StatusHistory";
import { getEvent, listActiveRetentionOptions, listRetentionChanges, listStatusChanges } from "@/lib/admin/queries";
import { formatBytes, formatDate, formatDateTime, formatMoney, t, tp, type MessageKey } from "@/lib/i18n";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Eveniment" };

export default async function AdminEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) notFound();
  const event = await getEvent(eventId);
  if (!event) notFound();
  const [options, history, statusChanges] = await Promise.all([
    listActiveRetentionOptions(),
    listRetentionChanges(eventId),
    listStatusChanges(eventId),
  ]);

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

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <h1 className={ui.pageTitle}>{title}</h1>
        <p className={`${ui.data} text-sm text-ink-muted`}>
          {t(`admin.status.${event.status}` as MessageKey)} · {t(`admin.origin.${event.origin}`)}
          {event.organizerEmail !== null && <> · {event.organizerEmail}</>}
        </p>
        {event.lastActivationRequestAt !== null && event.status === "awaiting_activation" && (
          <p role="status" className={ui.caution}>
            {t("admin.detail.activationRequested", { date: formatDateTime(event.lastActivationRequestAt) })}
          </p>
        )}
        {event.status === "awaiting_activation" && event.pendingPurgeAt !== null && (
          <p className={ui.hint}>{t("admin.pendingPurge", { date: formatDate(event.pendingPurgeAt) })}</p>
        )}
      </header>

      <section aria-labelledby="state-title" className={ui.section}>
        <h2 id="state-title" className={ui.kicker}>
          {t("admin.state.title")}
        </h2>
        <EventStateActions eventId={event.id} status={event.status} />
      </section>

      {event.status === "awaiting_activation" && event.name !== null && (
        <section aria-labelledby="pending-edit-title" className={ui.section}>
          <h2 id="pending-edit-title" className={ui.kicker}>
            {t("admin.detail.edit")}
          </h2>
          <PendingEventForm eventId={event.id} name={event.name} eventDate={event.eventDate} />
        </section>
      )}

      <section aria-labelledby="links-title" className={ui.section}>
        <h2 id="links-title" className={ui.kicker}>
          {t("admin.detail.links")}
        </h2>
        {event.status === "active" || event.status === "awaiting_activation" || event.status === "suspended" ? (
          <>
            <p className="break-all">
              {t("admin.detail.uploadUrl")}{" "}
              <a href={event.uploadUrl} data-testid="upload-url" className={`${ui.link} ${ui.data} text-sm`}>
                {event.uploadUrl}
              </a>
            </p>
            <div className="flex flex-wrap gap-3">
              <a href={`/admin/events/${event.id}/qr.png`} download className={ui.buttonSecondary}>
                {t("admin.detail.downloadPng")}
              </a>
              <a href={`/admin/events/${event.id}/qr.svg`} download className={ui.buttonSecondary}>
                {t("admin.detail.downloadSvg")}
              </a>
            </div>
          </>
        ) : (
          <p className="text-ink-muted">{t("admin.detail.linkInactive")}</p>
        )}
        <p>
          {t("admin.detail.stats", { files: tp("plural.files", event.fileCount), size: formatBytes(event.totalBytes) })}
        </p>
        {event.purgeAt !== null && (
          <p>
            {t("admin.detail.priceLine", {
              price: formatMoney(event.finalPriceMinor),
              months: tp("plural.months", event.retentionMonths),
              date: formatDateTime(event.purgeAt),
            })}
          </p>
        )}
      </section>

      {event.status === "active" &&
        event.name !== null &&
        event.organizerEmail !== null &&
        event.uploadStartsAt !== null &&
        event.uploadEndsAt !== null &&
        event.basePriceMinor !== null &&
        event.retentionOptionId !== null && (
        <section aria-labelledby="edit-title" className={ui.section}>
          <h2 id="edit-title" className={ui.kicker}>
            {t("admin.detail.edit")}
          </h2>
          <EventForm
            options={formOptions}
            initial={{
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
            }}
          />
        </section>
      )}

      <section aria-labelledby="status-history-title" className={ui.section}>
        <h2 id="status-history-title" className={ui.kicker}>
          {t("admin.statusHistory.title")}
        </h2>
        <StatusHistory rows={statusChanges} />
      </section>

      <section aria-labelledby="history-title" className={ui.section}>
        <h2 id="history-title" className={ui.kicker}>
          {t("admin.history.title")}
        </h2>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("admin.history.title")}>
          <table className={`${ui.table} min-w-[640px]`}>
            <thead>
              <tr className={ui.theadRow}>
                <th scope="col" className={ui.th}>{t("admin.history.when")}</th>
                <th scope="col" className={ui.th}>{t("admin.history.who")}</th>
                <th scope="col" className={ui.th}>{t("admin.history.retention")}</th>
                <th scope="col" className={ui.th}>{t("admin.history.price")}</th>
                <th scope="col" className={ui.th}>{t("admin.history.purgeAt")}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={`${h.at}-${String(h.toMonths)}`} className={ui.row}>
                  <td className={`${ui.td} ${ui.data} text-sm`}>{formatDateTime(h.at)}</td>
                  <td className={ui.td}>{t(`admin.actor.${h.actorKind}`)}</td>
                  <td className={ui.td}>
                    {h.fromMonths === null ? "" : `${tp("plural.months", h.fromMonths)} → `}
                    {tp("plural.months", h.toMonths)}
                  </td>
                  <td className={`${ui.td} ${ui.data} text-sm`}>
                    {h.fromFinalPriceMinor === null ? "" : `${formatMoney(h.fromFinalPriceMinor)} → `}
                    {formatMoney(h.toFinalPriceMinor)}
                  </td>
                  <td className={`${ui.td} ${ui.data} text-sm`}>{formatDateTime(h.toPurgeAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="danger-title" className="flex flex-col gap-4 border-t border-danger pt-4">
        <h2 id="danger-title" className={`${ui.kicker} text-danger`}>
          {t("admin.delete.section")}
        </h2>
        <p>{t("admin.delete.explain")}</p>
        <DeleteEventDialog eventId={event.id} eventName={event.name} />
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeleteEventDialog } from "@/components/admin/DeleteEventDialog";
import { EventForm } from "@/components/admin/EventForm";
import { getEvent, listActiveRetentionOptions, listRetentionChanges } from "@/lib/admin/queries";
import { formatBytes, formatDateTime, formatMoney, t, tp } from "@/lib/i18n";

export const metadata: Metadata = { title: "Eveniment" };

export default async function AdminEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) notFound();
  const event = await getEvent(eventId);
  if (!event) notFound();
  const [options, history] = await Promise.all([listActiveRetentionOptions(), listRetentionChanges(eventId)]);

  // Opțiunea curentă rămâne în listă chiar dacă între timp a fost dezactivată.
  const formOptions = options.some((o) => o.id === event.retentionOptionId)
    ? options
    : [...options, { id: event.retentionOptionId, months: event.retentionMonths, surchargeMinor: event.finalPriceMinor - event.basePriceMinor, active: false }];

  const title = event.name ?? t("admin.anonymizedEvent");

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{title}</h1>
        {event.status !== "active" && <p className="text-muted">{t(`admin.status.${event.status}`)}</p>}
      </header>

      <section aria-labelledby="links-title" className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4">
        <h2 id="links-title" className="text-lg font-semibold">
          {t("admin.detail.links")}
        </h2>
        {event.status === "active" ? (
          <>
            <p className="break-all">
              {t("admin.detail.uploadUrl")}{" "}
              <a href={event.uploadUrl} data-testid="upload-url" className="text-brand-700 underline underline-offset-4">
                {event.uploadUrl}
              </a>
            </p>
            <div className="flex flex-wrap gap-3">
              <a href={`/admin/events/${event.id}/qr.png`} download className="inline-flex min-h-11 items-center rounded-lg border border-brand-600 px-4 font-semibold text-brand-700">
                {t("admin.detail.downloadPng")}
              </a>
              <a href={`/admin/events/${event.id}/qr.svg`} download className="inline-flex min-h-11 items-center rounded-lg border border-brand-600 px-4 font-semibold text-brand-700">
                {t("admin.detail.downloadSvg")}
              </a>
            </div>
          </>
        ) : (
          <p className="text-muted">{t("admin.detail.linkInactive")}</p>
        )}
        <p>
          {t("admin.detail.stats", { files: tp("plural.files", event.fileCount), size: formatBytes(event.totalBytes) })}
        </p>
        <p>
          {t("admin.detail.priceLine", {
            price: formatMoney(event.finalPriceMinor),
            months: tp("plural.months", event.retentionMonths),
            date: formatDateTime(event.purgeAt),
          })}
        </p>
      </section>

      {event.status === "active" && event.name !== null && event.organizerEmail !== null && (
        <section aria-labelledby="edit-title" className="flex flex-col gap-4">
          <h2 id="edit-title" className="text-lg font-semibold">
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

      <section aria-labelledby="history-title" className="flex flex-col gap-3">
        <h2 id="history-title" className="text-lg font-semibold">
          {t("admin.history.title")}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-gray-300">
                <th scope="col" className="p-2">{t("admin.history.when")}</th>
                <th scope="col" className="p-2">{t("admin.history.who")}</th>
                <th scope="col" className="p-2">{t("admin.history.retention")}</th>
                <th scope="col" className="p-2">{t("admin.history.price")}</th>
                <th scope="col" className="p-2">{t("admin.history.purgeAt")}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={`${h.at}-${String(h.toMonths)}`} className="border-b border-gray-200">
                  <td className="p-2">{formatDateTime(h.at)}</td>
                  <td className="p-2">{t(`admin.actor.${h.actorKind}`)}</td>
                  <td className="p-2">
                    {h.fromMonths === null ? "" : `${tp("plural.months", h.fromMonths)} → `}
                    {tp("plural.months", h.toMonths)}
                  </td>
                  <td className="p-2">
                    {h.fromFinalPriceMinor === null ? "" : `${formatMoney(h.fromFinalPriceMinor)} → `}
                    {formatMoney(h.toFinalPriceMinor)}
                  </td>
                  <td className="p-2">{formatDateTime(h.toPurgeAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="danger-title" className="flex flex-col gap-3 rounded-lg border border-danger p-4">
        <h2 id="danger-title" className="text-lg font-semibold text-danger">
          {t("admin.delete.section")}
        </h2>
        <p>{t("admin.delete.explain")}</p>
        <DeleteEventDialog eventId={event.id} eventName={event.name} />
      </section>
    </div>
  );
}

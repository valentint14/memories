import { t } from "@/lib/i18n";

/** Descărcarea codului QR de către organizator (002/FR-009). */
export function QrDownloads({ eventId }: { eventId: string }) {
  return (
    <div className="flex flex-wrap gap-3">
      <a
        href={`/events/${eventId}/qr.png`}
        download
        className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-4 font-semibold text-white"
      >
        {t("organizer.qrPng")}
      </a>
      <a
        href={`/events/${eventId}/qr.svg`}
        download
        className="inline-flex min-h-11 items-center rounded-lg border border-brand-600 px-4 font-semibold text-brand-700"
      >
        {t("organizer.qrSvg")}
      </a>
    </div>
  );
}

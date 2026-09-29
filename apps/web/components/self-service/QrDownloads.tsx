import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

/** Descărcarea codului QR de către organizator (002/FR-009). */
export function QrDownloads({ eventId }: { eventId: string }) {
  return (
    <div className="grid gap-3">
      <a href={`/events/${eventId}/qr.png`} download className={ui.buttonSecondary}>
        {t("organizer.qrPng")}
      </a>
      <a href={`/events/${eventId}/qr.svg`} download className={ui.buttonSecondary}>
        {t("organizer.qrSvg")}
      </a>
    </div>
  );
}

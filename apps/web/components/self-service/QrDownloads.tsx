import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { SheetActions } from "../ui/SheetActions";

/**
 * Descărcarea codului QR de către organizator (002/FR-009), în bara de acțiuni a foii: PNG (cel mai
 * folosit) e acțiunea principală, deci ultima pe ecrane late și prima pe telefon.
 */
export function QrDownloads({ eventId }: { eventId: string }) {
  return (
    <SheetActions>
      <a href={`/events/${eventId}/qr.svg`} download className={ui.buttonSecondary}>
        {t("organizer.qrSvg")}
      </a>
      <a href={`/events/${eventId}/qr.png`} download className={ui.buttonSecondary}>
        {t("organizer.qrPng")}
      </a>
    </SheetActions>
  );
}

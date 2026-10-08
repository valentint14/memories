import { t, type MessageKey } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { Sheet } from "../ui/Sheet";
import { QrDownloads } from "./QrDownloads";

/**
 * Foaia „Link și cod QR” a organizatorului (002/FR-009): linkul de încărcare (același ca în codul
 * QR) și descărcările codului, sub foaia de activare sau sub cea de păstrare.
 */
export function UploadLinkSheet({ eventId, uploadUrl, explain }: { eventId: string; uploadUrl: string; explain: MessageKey }) {
  return (
    <Sheet id="qr-title" title={t("admin.detail.links")}>
      <p className="leading-relaxed">{t(explain)}</p>
      <p className="flex flex-col gap-1">
        <span className="text-sm text-ink-muted">{t("organizer.uploadUrl")}</span>
        <a href={uploadUrl} data-testid="upload-url" className={`${ui.link} ${ui.data} text-sm break-all`}>
          {uploadUrl}
        </a>
      </p>
      <QrDownloads eventId={eventId} />
    </Sheet>
  );
}

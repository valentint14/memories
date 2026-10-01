import { formatDate, formatMoney, t, tp } from "@/lib/i18n";
import type { ActivationInfo } from "@/lib/organizer/activation";
import { ui } from "@/lib/ui";
import { Sheet } from "../ui/Sheet";
import { PayActivationForm } from "./PayActivationForm";

/**
 * Panoul unui eveniment în așteptarea activării (002: FR-018, FR-019; 003: FR-001): prețul
 * pachetului complet, ce include, data ștergerii automate și plata cu perioada de păstrare aleasă.
 */
export function EventStatusPanel({
  eventId,
  pendingPurgeAt,
  info,
}: {
  eventId: string;
  pendingPurgeAt: string | null;
  info: ActivationInfo;
}) {
  const files = String(info.maxFilesPerGuest);
  return (
    <Sheet id="activation-title" title={t("activation.title")}>
      <p className={`${ui.data} text-2xl font-medium`}>{t("activation.price", { price: formatMoney(info.priceMinor) })}</p>
      <p className="leading-relaxed">
        {info.retentionMonths === null
          ? t("activation.includesNoRetention", { files })
          : t("activation.includes", { months: tp("plural.months", info.retentionMonths), files })}
      </p>
      {pendingPurgeAt !== null && <p className={ui.hint}>{t("activation.pendingPurge", { date: formatDate(pendingPurgeAt) })}</p>}
      <p className="leading-relaxed">{t("activation.how")}</p>
      <PayActivationForm eventId={eventId} options={info.options} />
    </Sheet>
  );
}

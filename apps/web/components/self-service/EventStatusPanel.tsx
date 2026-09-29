import { formatDate, formatMoney, t, tp } from "@/lib/i18n";
import type { ActivationInfo } from "@/lib/organizer/activation";
import { ui } from "@/lib/ui";
import { Sheet } from "../ui/Sheet";
import { RequestActivationButton } from "./RequestActivationButton";

/**
 * Panoul unui eveniment în așteptarea activării (002: FR-018, FR-018a, FR-019): prețul curent, ce
 * include pachetul complet, data ștergerii automate și cererea de activare.
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
      <RequestActivationButton eventId={eventId} lastRequestAt={info.lastRequestAt} />
    </Sheet>
  );
}

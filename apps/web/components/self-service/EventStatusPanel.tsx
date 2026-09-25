import { formatDate, formatMoney, t, tp } from "@/lib/i18n";
import type { ActivationInfo } from "@/lib/organizer/activation";
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
    <section aria-labelledby="activation-title" className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4">
      <h2 id="activation-title" className="text-lg font-semibold">
        {t("activation.title")}
      </h2>
      <p className="text-xl font-semibold">{t("activation.price", { price: formatMoney(info.priceMinor) })}</p>
      <p>
        {info.retentionMonths === null
          ? t("activation.includesNoRetention", { files })
          : t("activation.includes", { months: tp("plural.months", info.retentionMonths), files })}
      </p>
      {pendingPurgeAt !== null && (
        <p className="text-sm text-muted">{t("activation.pendingPurge", { date: formatDate(pendingPurgeAt) })}</p>
      )}
      <p>{t("activation.how")}</p>
      <RequestActivationButton eventId={eventId} lastRequestAt={info.lastRequestAt} />
    </section>
  );
}

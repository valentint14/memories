import { businessDetails } from "@/lib/business";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

/**
 * Datele de identificare ale prestatorului, la începutul paginilor legale. Fără niciun rând setat
 * (variabilele `BUSINESS_*` lipsesc), nu afișează nimic.
 */
export function BusinessIdentity() {
  const b = businessDetails();
  const rows = [
    [t("business.taxId"), b.taxId],
    [t("business.registrationNo"), b.registrationNo],
    [t("business.address"), b.address],
    [t("business.email"), b.email],
    [t("business.phone"), b.phone],
  ].filter((row): row is [string, string] => row[1] !== null);
  if (b.name === null && rows.length === 0) return null;

  return (
    <section aria-label={t("business.label")} className={`${ui.notice} flex flex-col gap-2`}>
      <p className={`${ui.kicker} text-ink-muted`}>{t("business.label")}</p>
      {b.name !== null && <p className="font-semibold">{b.name}</p>}
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

import type { Metadata } from "next";
import { AddRetentionOption, RetentionCatalog } from "@/components/admin/RetentionCatalog";
import { StatBand } from "@/components/ui/StatBand";
import { getPackageSettings } from "@/lib/admin/package";
import { listRetentionCatalog } from "@/lib/admin/queries";
import { formatMoney, t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Opțiuni de păstrare" };

/**
 * Catalogul opțiunilor de retenție (FR-038): antetul cu butonul de adăugare, banda de cifre și un
 * tabel compact, cu prețul pe care îl vede organizatorul (pachetul + suplimentul).
 */
export default async function RetentionCatalogPage() {
  const [options, pkg] = await Promise.all([listRetentionCatalog(), getPackageSettings()]);
  const stats = [
    { label: t("admin.retentionPage.stat.options"), value: String(options.length) },
    { label: t("admin.retentionPage.stat.active"), value: String(options.filter((o) => o.active).length) },
    { label: t("admin.retentionPage.stat.inUse"), value: String(options.filter((o) => o.usedBy > 0).length) },
    { label: t("admin.retentionPage.stat.events"), value: String(options.reduce((sum, o) => sum + o.usedBy, 0)) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className={ui.pageTitle}>{t("admin.retentionPage.title")}</h1>
          <p className="max-w-2xl leading-relaxed text-ink-muted">{t("admin.retentionPage.intro", { price: formatMoney(pkg.priceMinor) })}</p>
        </div>
        <AddRetentionOption />
      </header>
      <StatBand label={t("admin.retentionPage.summary")} stats={stats} />
      <RetentionCatalog options={options} basePriceMinor={pkg.priceMinor} includedOptionId={pkg.retentionOptionId} />
    </div>
  );
}

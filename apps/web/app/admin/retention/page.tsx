import type { Metadata } from "next";
import { RetentionCatalog } from "@/components/admin/RetentionCatalog";
import { StatBand } from "@/components/ui/StatBand";
import { listRetentionCatalog } from "@/lib/admin/queries";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Opțiuni de păstrare" };

/** Catalogul opțiunilor de retenție (FR-038), în același format ca fișa unui eveniment. */
export default async function RetentionCatalogPage() {
  const options = await listRetentionCatalog();
  const stats = [
    { label: t("admin.retentionPage.stat.options"), value: String(options.length) },
    { label: t("admin.retentionPage.stat.active"), value: String(options.filter((o) => o.active).length) },
    { label: t("admin.retentionPage.stat.inUse"), value: String(options.filter((o) => o.usedBy > 0).length) },
    { label: t("admin.retentionPage.stat.events"), value: String(options.reduce((sum, o) => sum + o.usedBy, 0)) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className={ui.pageTitle}>{t("admin.retentionPage.title")}</h1>
        <p className="max-w-2xl leading-relaxed text-ink-muted">{t("admin.retentionPage.intro")}</p>
      </header>
      <StatBand label={t("admin.retentionPage.summary")} stats={stats} />
      <RetentionCatalog options={options} />
    </div>
  );
}

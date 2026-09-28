import type { Metadata } from "next";
import { RetentionCatalog } from "@/components/admin/RetentionCatalog";
import { listRetentionCatalog } from "@/lib/admin/queries";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Opțiuni de păstrare" };

/** Catalogul opțiunilor de retenție (FR-038). */
export default async function RetentionCatalogPage() {
  const options = await listRetentionCatalog();
  return (
    <div className="flex flex-col gap-6">
      <h1 className={ui.pageTitle}>{t("admin.retentionPage.title")}</h1>
      <p className="max-w-2xl leading-relaxed text-ink-muted">{t("admin.retentionPage.intro")}</p>
      <RetentionCatalog options={options} />
    </div>
  );
}

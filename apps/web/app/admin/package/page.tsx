import type { Metadata } from "next";
import { PackageForm } from "@/components/admin/PackageForm";
import { StatBand } from "@/components/ui/StatBand";
import { getPackageSettings } from "@/lib/admin/package";
import { listActiveRetentionOptions } from "@/lib/admin/queries";
import { formatMoney, t, tp } from "@/lib/i18n";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Pachetul complet" };

const MB = 1024 * 1024;

/** Configurarea pachetului complet (002: FR-014–FR-016, FR-021), în formatul fișei unui eveniment. */
export default async function AdminPackagePage() {
  const [settings, options] = await Promise.all([getPackageSettings(), listActiveRetentionOptions()]);
  const retention = options.find((o) => o.id === settings.retentionOptionId);
  // Banda arată valorile salvate; formularul de dedesubt le modifică.
  const stats = [
    { label: t("admin.package.stat.price"), value: formatMoney(settings.priceMinor) },
    { label: t("admin.package.stat.retention"), value: retention === undefined ? t("admin.detail.none") : tp("plural.months", retention.months) },
    { label: t("admin.package.stat.files"), value: String(settings.maxFilesPerGuest) },
    {
      label: t("admin.package.stat.sizes"),
      value: `${String(settings.maxPhotoBytes / MB)} · ${String(settings.maxVideoBytes / MB)} MB`,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className={ui.pageTitle}>{t("admin.package.title")}</h1>
        <p className="max-w-2xl leading-relaxed text-ink-muted">{t("admin.package.intro")}</p>
      </header>
      <StatBand label={t("admin.package.summary")} stats={stats} />
      <PackageForm initial={settings} options={options.map((o) => ({ id: o.id, months: o.months }))} />
    </div>
  );
}

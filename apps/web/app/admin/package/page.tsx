import type { Metadata } from "next";
import { PackageForm } from "@/components/admin/PackageForm";
import { getPackageSettings } from "@/lib/admin/package";
import { listActiveRetentionOptions } from "@/lib/admin/queries";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: "Pachetul complet" };

/** Configurarea pachetului complet (002: FR-014–FR-016, FR-021). */
export default async function AdminPackagePage() {
  const [settings, options] = await Promise.all([getPackageSettings(), listActiveRetentionOptions()]);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("admin.package.title")}</h1>
      <p className="max-w-2xl text-muted">{t("admin.package.intro")}</p>
      <PackageForm initial={settings} options={options.map((o) => ({ id: o.id, months: o.months }))} />
    </div>
  );
}

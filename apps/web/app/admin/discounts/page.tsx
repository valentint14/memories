import type { Metadata } from "next";
import { DiscountCodesSheet } from "@/components/admin/DiscountCodesSheet";
import { DiscountGenerateForm } from "@/components/admin/DiscountGenerateForm";
import { listDiscountCodes } from "@/lib/admin/discounts";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Coduri de reducere" };

/** Codurile de reducere (005): generarea pe un rând, lista (care crește în timp) pe rândul ei. */
export default async function AdminDiscountsPage() {
  const codes = await listDiscountCodes();
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className={ui.pageTitle}>{t("admin.discounts.title")}</h1>
        <p className="max-w-2xl leading-relaxed text-ink-muted">{t("admin.discounts.intro")}</p>
      </header>
      <DiscountGenerateForm />
      <DiscountCodesSheet codes={codes} />
    </div>
  );
}

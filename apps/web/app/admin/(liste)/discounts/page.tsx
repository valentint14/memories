import type { Metadata } from "next";
import { DiscountCodesSheet } from "@/components/admin/DiscountCodesSheet";
import { DiscountGenerateForm } from "@/components/admin/DiscountGenerateForm";
import { StatBand } from "@/components/ui/StatBand";
import { listDiscountCodes } from "@/lib/admin/discounts";
import { formatMoney, t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Coduri de reducere" };

/**
 * Codurile de reducere (005), ca registru: antetul cu butonul de generare, banda de cifre (coduri
 * disponibile, utilizări, reducerea acordată pe plățile încasate, plăți în curs) și lista codurilor.
 */
export default async function AdminDiscountsPage() {
  const codes = await listDiscountCodes();
  const redemptions = codes.flatMap((c) => c.redemptions);
  const settled = redemptions.filter((r) => r.status !== "open");
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className={ui.pageTitle}>{t("admin.discounts.title")}</h1>
          <p className="max-w-2xl leading-relaxed text-ink-muted">{t("admin.discounts.intro")}</p>
        </div>
        <DiscountGenerateForm />
      </header>
      <StatBand
        label={t("admin.discounts.stats")}
        stats={[
          { label: t("admin.discounts.stat.available"), value: String(codes.filter((c) => c.status === "available").length) },
          { label: t("admin.discounts.stat.uses"), value: String(settled.length) },
          { label: t("admin.discounts.stat.discounted"), value: formatMoney(settled.reduce((sum, r) => sum + r.discountMinor, 0)) },
          {
            label: t("admin.discounts.stat.pending"),
            value: String(redemptions.length - settled.length),
            accent: redemptions.length > settled.length,
          },
        ]}
      />
      <DiscountCodesSheet codes={codes} />
    </div>
  );
}

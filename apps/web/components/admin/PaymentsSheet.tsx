import type { AdminPaymentRow } from "@/lib/admin/queries";
import { formatDateTime, formatMoney, t, tp, type MessageKey } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { Sheet } from "../ui/Sheet";

/** Rambursarea plății (004: FR-012): suma și data, iar la rambursarea integrală efectul aplicat. */
function refundLine(p: AdminPaymentRow): string | null {
  if (p.refundedMinor === 0) return null;
  const date = p.refundedAt === null ? "" : formatDateTime(p.refundedAt);
  if (p.refundedMinor < p.amountMinor) return t("admin.payments.refund.partial", { amount: formatMoney(p.refundedMinor), date });
  const full = t("admin.payments.refund.full", { date });
  if (p.refundEffect === null) return full;
  const months = tp("plural.months", p.previousRetentionMonths ?? p.retentionMonths);
  return `${full} · ${t(`admin.payments.refund.effect.${p.refundEffect}`, { months })}`;
}

/**
 * Plățile evenimentului, pentru administrator (003: FR-013): suma, scopul, starea, data, referința
 * Stripe și datele de facturare (FR-012a), ca baza facturii emise în afara aplicației. Foaia stă
 * pe rândul ei: lista crește în timp. Plățile de rambursat, contestate sau rambursate integral sunt
 * evidențiate; starea e spusă și în text (WCAG 1.4.1).
 */
export function PaymentsSheet({ payments }: { payments: AdminPaymentRow[] }) {
  return (
    <Sheet id="payments-title" title={t("admin.payments.title")}>
      {payments.length === 0 ? (
        <p className="text-ink-muted">{t("admin.payments.empty")}</p>
      ) : (
        <ol aria-label={t("admin.payments.title")} className="flex flex-col">
          {payments.map((p) => {
            const refund = refundLine(p);
            const fullyRefunded = p.refundedMinor > 0 && p.refundedMinor === p.amountMinor;
            const flagged = (p.status === "refund_due" && !fullyRefunded) || p.disputedAt !== null;
            return (
              <li key={p.id} className="flex flex-col gap-1 border-b border-rule py-3 first:pt-0 last:border-b-0 last:pb-0">
                <span className={`${ui.data} text-xs text-ink-muted`}>{formatDateTime(p.paidAt ?? p.createdAt)}</span>
                <span>
                  <span className={ui.data}>{formatMoney(p.amountMinor)}</span>
                  {" · "}
                  {t(`admin.payments.purpose.${p.purpose}`, { months: tp("plural.months", p.retentionMonths) })}
                  {" · "}
                  <span className={flagged || fullyRefunded ? "text-danger" : p.status === "paid" ? "text-success" : "text-ink-muted"}>
                    {fullyRefunded ? t("admin.payments.status.refunded") : t(`admin.payments.status.${p.status}`)}
                    {p.disputedAt !== null && ` · ${t("admin.payments.disputed")}`}
                  </span>
                </span>
                {p.discount !== null && (
                  <span className="text-sm text-ink-muted">
                    {t("admin.payments.discount", {
                      full: formatMoney(p.discount.fullAmountMinor),
                      discount: formatMoney(p.discount.amountMinor),
                      code: p.discount.code,
                    })}
                  </span>
                )}
                {p.refundReason !== null && !fullyRefunded && (
                  <span className="text-sm text-danger">{t(`admin.payments.reason.${p.refundReason}` as MessageKey)}</span>
                )}
                {refund !== null && <span className="text-sm text-ink-muted">{refund}</span>}
                {(p.billingName !== null || p.billingCompany !== null) && (
                  <span className="text-sm">
                    {[p.billingName, p.billingCompany, p.billingTaxId === null ? null : `CUI ${p.billingTaxId}`].filter(Boolean).join(" · ")}
                  </span>
                )}
                {p.billingAddress !== null && <span className="text-sm text-ink-muted">{p.billingAddress}</span>}
                {p.reference !== null && <span className={`${ui.data} text-xs break-all text-ink-muted`}>{p.reference}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </Sheet>
  );
}

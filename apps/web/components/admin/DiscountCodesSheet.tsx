"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { deleteDiscountCode, disableDiscountCode } from "@/lib/actions/admin";
import type { DiscountCodeRow, DiscountStatus } from "@/lib/admin/discounts";
import { formatDate, formatDateTime, formatMoney, t } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { SelectField } from "../ui/SelectField";
import { Sheet } from "../ui/Sheet";

function reduction(c: DiscountCodeRow): string {
  return c.discountType === "fixed" ? formatMoney(c.discountValue) : t("admin.discounts.percent", { percent: c.discountValue });
}

/**
 * Lista codurilor de reducere (005: FR-004, FR-013): starea, reducerea, utilizările „x din y”,
 * expirarea și nota; extins, fiecare utilizare (eveniment, organizator, data sau „plată în curs”).
 * Un cod disponibil se poate dezactiva, iar unul nefolosit (fără plăți reușite sau în curs) se poate
 * și șterge; ambele cer confirmare.
 */
export function DiscountCodesSheet({ codes }: { codes: DiscountCodeRow[] }) {
  const [filter, setFilter] = useState<"all" | DiscountStatus>("all");
  const [confirm, setConfirm] = useState<{ row: DiscountCodeRow; action: "disable" | "delete" } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const shown = filter === "all" ? codes : codes.filter((c) => c.status === filter);

  return (
    <Sheet id="discount-list-title" title={t("admin.discounts.list.title")}>
      <SelectField
        label={t("admin.discounts.filter")}
        value={filter}
        onChange={(v) => {
          setFilter(v as "all" | DiscountStatus);
        }}
        className="flex max-w-xs flex-col gap-1.5"
        options={[
          { id: "all", label: t("admin.discounts.filter.all") },
          { id: "available", label: t("admin.discounts.status.available") },
          { id: "exhausted", label: t("admin.discounts.status.exhausted") },
          { id: "expired", label: t("admin.discounts.status.expired") },
          { id: "disabled", label: t("admin.discounts.status.disabled") },
        ]}
      />
      {shown.length === 0 ? (
        <p className="text-ink-muted">{t("admin.discounts.empty")}</p>
      ) : (
        <ul aria-label={t("admin.discounts.list.title")} className="flex flex-col">
          {shown.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 border-b border-rule py-3 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className={`${ui.data} text-lg`}>{c.code}</span>
                <span className={`${ui.kicker} ${c.status === "available" ? "text-success" : "text-ink-muted"}`}>
                  {t(`admin.discounts.status.${c.status}`)}
                </span>
              </div>
              <p className="text-sm">
                {reduction(c)} · {t(`admin.discounts.kindShort.${c.kind}`)} ·{" "}
                <span className={ui.data}>{t("admin.discounts.uses", { uses: c.uses, max: c.maxUses })}</span>
              </p>
              <p className="text-sm text-ink-muted">
                {[
                  c.expiresAt === null ? null : t("admin.discounts.expires", { date: formatDate(c.expiresAt) }),
                  t("admin.discounts.created", { date: formatDate(c.createdAt) }),
                  c.note,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {c.redemptions.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer py-1 font-medium">{t("admin.discounts.redemptions", { count: c.redemptions.length })}</summary>
                  <ul className="flex flex-col gap-1 pl-4">
                    {c.redemptions.map((r) => (
                      <li key={r.paymentId}>
                        {r.eventId === null ? (
                          (r.eventName ?? "—")
                        ) : (
                          <Link href={`/admin/events/${r.eventId}`} className={ui.link}>
                            {r.eventName ?? "—"}
                          </Link>
                        )}
                        {" · "}
                        {r.organizerEmail ?? "—"}
                        {" · "}
                        {r.status === "open" ? t("admin.discounts.pending") : formatDateTime(r.paidAt ?? r.createdAt)}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {(c.status === "available" || c.uses === 0) && (
                <div className="flex flex-wrap gap-x-6">
                  {c.status === "available" && (
                    <Button
                      onPress={() => {
                        setError(null);
                        setConfirm({ row: c, action: "disable" });
                      }}
                      className={ui.buttonText}
                    >
                      {t("admin.discounts.disable")}
                    </Button>
                  )}
                  {c.uses === 0 && (
                    <Button
                      onPress={() => {
                        setError(null);
                        setConfirm({ row: c, action: "delete" });
                      }}
                      className={`${ui.buttonText} text-danger`}
                    >
                      {t("admin.discounts.delete")}
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ModalOverlay
        isOpen={confirm !== null}
        isDismissable={!pending}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        className={ui.overlay}
      >
        <Modal className={ui.dialog}>
          <Dialog role="alertdialog" className="flex flex-col gap-4 outline-none">
            <Heading slot="title" className={ui.dialogTitle}>
              {confirm?.action === "delete"
                ? t("admin.discounts.deleteTitle", { code: confirm.row.code })
                : t("admin.discounts.disableTitle", { code: confirm?.row.code ?? "" })}
            </Heading>
            <p className="leading-relaxed">{t(confirm?.action === "delete" ? "admin.discounts.deleteBody" : "admin.discounts.disableBody")}</p>
            {error !== null && (
              <p role="alert" className={ui.fieldError}>
                {error}
              </p>
            )}
            <div className={ui.dialogActions}>
              <Button
                onPress={() => {
                  setConfirm(null);
                }}
                isDisabled={pending}
                className={ui.buttonSecondary}
              >
                {t("common.cancel")}
              </Button>
              <Button
                isDisabled={pending}
                className={ui.buttonDangerSolid}
                onPress={() => {
                  const target = confirm;
                  if (target === null) return;
                  startTransition(async () => {
                    const result = target.action === "delete" ? await deleteDiscountCode(target.row.id) : await disableDiscountCode(target.row.id);
                    if (result.ok) {
                      setConfirm(null);
                    } else {
                      setError(t(`errors.${result.error}`));
                    }
                  });
                }}
              >
                {t(confirm?.action === "delete" ? "admin.discounts.delete" : "admin.discounts.disable")}
              </Button>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </Sheet>
  );
}

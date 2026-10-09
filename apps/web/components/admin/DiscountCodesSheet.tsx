"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { deleteDiscountCode, disableDiscountCode } from "@/lib/actions/admin";
import type { DiscountCodeRow, DiscountStatus } from "@/lib/admin/discounts";
import { formatDate, formatMoney, t, type MessageKey } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { CheckIcon, ChevronRightIcon, CopyIcon } from "../ui/icons";

type Filter = "all" | DiscountStatus;
const FILTERS: Filter[] = ["all", "available", "exhausted", "expired", "disabled"];

const STAMP: Record<DiscountStatus, string> = {
  available: "border-success text-success",
  exhausted: "border-ink-muted text-ink-muted",
  expired: "border-ink-muted text-ink-muted",
  disabled: "border-danger text-danger",
};

function reduction(c: DiscountCodeRow): string {
  return c.discountType === "fixed" ? formatMoney(c.discountValue) : t("admin.discounts.percent", { percent: c.discountValue });
}

/** Starea codului ca ștampilă, ca starea evenimentelor. */
function Stamp({ status }: { status: DiscountStatus }) {
  return <span className={`inline-flex w-fit items-center border px-2 py-0.5 ${ui.kicker} ${STAMP[status]}`}>{t(`admin.discounts.status.${status}`)}</span>;
}

/** Utilizările „x / y” și o bară subțire de umplere. */
function Uses({ c }: { c: DiscountCodeRow }) {
  return (
    <span className="flex flex-col gap-1.5">
      <span className={`${ui.data} text-sm`}>{t("admin.discounts.usesShort", { uses: c.uses, max: c.maxUses })}</span>
      <span aria-hidden="true" className="block h-1 w-24 bg-rule">
        <span className="block h-1 bg-ink" style={{ width: `${String(Math.min(100, (c.uses / c.maxUses) * 100))}%` }} />
      </span>
    </span>
  );
}

/**
 * Registrul codurilor de reducere (005: FR-004, FR-013): file pe stări (cu numărul de coduri), apoi
 * un tabel pe ecrane late și rânduri compacte pe telefon. Un rând deschide fereastra codului: datele
 * lui, fiecare utilizare (eveniment, organizator, data, starea plății, reducerea) și acțiunile —
 * dezactivarea unui cod disponibil, ștergerea unuia nefolosit —, ambele cu confirmare.
 */
export function DiscountCodesSheet({ codes }: { codes: DiscountCodeRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"disable" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const shown = filter === "all" ? codes : codes.filter((c) => c.status === filter);
  const count = (f: Filter) => (f === "all" ? codes.length : codes.filter((c) => c.status === f).length);
  // Rândul se citește din listă la fiecare randare: după dezactivare, fereastra arată starea nouă.
  const selected = codes.find((c) => c.id === openId) ?? null;

  function openCode(id: string) {
    setCopied(false);
    setOpenId(id);
  }

  return (
    <section aria-labelledby="discount-list-title" className={ui.sheet}>
      <h2 id="discount-list-title" className="sr-only">
        {t("admin.discounts.list.title")}
      </h2>
      <div role="group" aria-label={t("admin.discounts.filter")} className="flex gap-6 overflow-x-auto border-b border-rule px-4">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => {
              setFilter(f);
            }}
            className={`flex min-h-12 shrink-0 cursor-pointer items-center gap-1.5 border-b-2 text-sm ${filter === f ? "border-ink font-medium text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
          >
            {t(`admin.discounts.tab.${f}`)}
            <span className={`${ui.data} text-xs`}>{count(f)}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="p-4 text-ink-muted">{t("admin.discounts.empty")}</p>
      ) : (
        <>
          <table className={`${ui.table} hidden sm:table`}>
            <thead>
              <tr className={ui.theadRow}>
                <th className={`${ui.th} pl-4`}>{t("admin.discounts.col.code")}</th>
                <th className={ui.th}>{t("admin.discounts.col.reduction")}</th>
                <th className={ui.th}>{t("admin.discounts.col.kind")}</th>
                <th className={ui.th}>{t("admin.discounts.col.uses")}</th>
                <th className={ui.th}>{t("admin.discounts.col.expires")}</th>
                <th className={ui.th}>{t("admin.discounts.col.status")}</th>
                <th className={`${ui.th} pr-4`}>
                  <span className="sr-only">{t("admin.discounts.open", { code: "" })}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                // Tot rândul deschide codul la clic; pentru tastatură, butonul de pe cod face același lucru.
                <tr
                  key={c.id}
                  onClick={() => {
                    openCode(c.id);
                  }}
                  className={`${ui.row} cursor-pointer last:border-b-0 hover:bg-paper`}
                >
                  <td className="py-3 pl-4 pr-2 align-middle">
                    <button
                      type="button"
                      aria-label={t("admin.discounts.open", { code: c.code })}
                      onClick={(e) => {
                        e.stopPropagation();
                        openCode(c.id);
                      }}
                      className={`${ui.data} cursor-pointer text-left text-base outline-none focus-visible:outline-2 focus-visible:outline-ink`}
                    >
                      {c.code}
                    </button>
                    {c.note !== null && <span className="block text-xs text-ink-muted">{c.note}</span>}
                  </td>
                  <td className={`${ui.data} p-2 align-middle text-sm`}>{reduction(c)}</td>
                  <td className="p-2 align-middle text-sm">{t(`admin.discounts.kindLabel.${c.kind}`)}</td>
                  <td className="p-2 align-middle">
                    <Uses c={c} />
                  </td>
                  <td className={`${ui.data} p-2 align-middle text-sm`}>{c.expiresAt === null ? "—" : formatDate(c.expiresAt)}</td>
                  <td className="p-2 align-middle">
                    <Stamp status={c.status} />
                  </td>
                  <td className="py-2 pl-2 pr-4 align-middle text-ink-muted">
                    <ChevronRightIcon className="ml-auto size-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul aria-label={t("admin.discounts.list.title")} className="flex flex-col sm:hidden">
            {shown.map((c) => (
              <li key={c.id} className="border-b border-rule last:border-b-0">
                <button
                  type="button"
                  aria-label={t("admin.discounts.open", { code: c.code })}
                  onClick={() => {
                    openCode(c.id);
                  }}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex items-center justify-between gap-3">
                      <span className={`${ui.data} text-base`}>{c.code}</span>
                      <Stamp status={c.status} />
                    </span>
                    <span className="text-sm text-ink-muted">
                      {reduction(c)} · {t(`admin.discounts.kindLabel.${c.kind}`)} ·{" "}
                      <span className={ui.data}>{t("admin.discounts.usesShort", { uses: c.uses, max: c.maxUses })}</span>
                    </span>
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-ink-muted" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <ModalOverlay
        isOpen={selected !== null}
        isDismissable
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
        className={ui.overlay}
      >
        <Modal className={`${ui.dialog} flex flex-col`}>
          <Dialog className="flex min-h-0 flex-col gap-5 overflow-y-auto outline-none">
            {({ close }) =>
              selected !== null && (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-2">
                      <Heading slot="title" className={`${ui.data} text-2xl`}>
                        {selected.code}
                      </Heading>
                      <Stamp status={selected.status} />
                    </div>
                    <Button
                      onPress={() => {
                        void navigator.clipboard.writeText(selected.code).then(() => {
                          setCopied(true);
                        });
                      }}
                      className={`${ui.buttonSecondaryCompact} min-w-28`}
                    >
                      {copied ? <CheckIcon className="size-4 text-success" /> : <CopyIcon className="size-4" />}
                      {t(copied ? "admin.discounts.copiedShort" : "admin.discounts.copy")}
                    </Button>
                  </div>
                  <p role="status" className="sr-only">
                    {copied ? t("admin.discounts.copiedOne", { code: selected.code }) : ""}
                  </p>

                  <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xs border border-rule bg-rule">
                    {(
                      [
                        ["admin.discounts.col.reduction", reduction(selected)],
                        ["admin.discounts.col.kind", t(`admin.discounts.kindLabel.${selected.kind}`)],
                        ["admin.discounts.col.uses", t("admin.discounts.usesShort", { uses: selected.uses, max: selected.maxUses })],
                        ["admin.discounts.col.expires", selected.expiresAt === null ? "—" : formatDate(selected.expiresAt)],
                      ] as [MessageKey, string][]
                    ).map(([label, value]) => (
                      <div key={label} className="flex flex-col gap-1 bg-paper-raised px-3 py-2">
                        <dt className={`${ui.kicker} text-ink-muted`}>{t(label)}</dt>
                        <dd className={`${ui.data} text-sm`}>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-sm text-ink-muted">
                    {[selected.note === null ? null : t("admin.discounts.noteLine", { note: selected.note }), t("admin.discounts.created", { date: formatDate(selected.createdAt) })]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>

                  <section aria-labelledby="discount-redemptions-title" className="flex flex-col gap-2">
                    <h3 id="discount-redemptions-title" className={`${ui.kicker} text-ink-muted`}>
                      {t("admin.discounts.redemptions.title")}
                    </h3>
                    {selected.redemptions.length === 0 ? (
                      <p className="border-y border-rule py-3 text-sm text-ink-muted">{t("admin.discounts.redemptions.none")}</p>
                    ) : (
                      <ul className="flex flex-col border-y border-rule">
                        {selected.redemptions.map((r) => (
                          <li key={r.paymentId} className="flex items-center justify-between gap-3 border-b border-rule py-2 text-sm last:border-b-0">
                            <span className="flex min-w-0 flex-col">
                              {r.eventId === null ? (
                                <span>{r.eventName ?? "—"}</span>
                              ) : (
                                <Link href={`/admin/events/${r.eventId}`} className={`${ui.link} w-fit`}>
                                  {r.eventName ?? "—"}
                                </Link>
                              )}
                              <span className="truncate text-xs text-ink-muted">{r.organizerEmail ?? "—"}</span>
                            </span>
                            <span className="flex shrink-0 flex-col items-end">
                              <span className={ui.data}>{r.status === "open" ? "—" : formatDate(r.paidAt ?? r.createdAt)}</span>
                              <span className={`text-xs ${r.status === "open" ? "text-accent" : "text-ink-muted"}`}>
                                {t(`admin.discounts.redemption.${r.status === "open" || r.status === "refund_due" ? r.status : "paid"}`)}
                                {r.discountMinor > 0 && ` · ${t("admin.discounts.redemption.discount", { amount: formatMoney(r.discountMinor) })}`}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  <div className={ui.dialogActionsBare}>
                    {selected.uses === 0 && (
                      <Button
                        onPress={() => {
                          setError(null);
                          setConfirm("delete");
                        }}
                        className={ui.buttonDanger}
                      >
                        {t("admin.discounts.delete")}
                      </Button>
                    )}
                    {selected.status === "available" && (
                      <Button
                        onPress={() => {
                          setError(null);
                          setConfirm("disable");
                        }}
                        className={ui.buttonDanger}
                      >
                        {t("admin.discounts.disable")}
                      </Button>
                    )}
                    <Button onPress={close} className={ui.buttonPrimary}>
                      {t("common.close")}
                    </Button>
                  </div>
                </>
              )
            }
          </Dialog>
        </Modal>
      </ModalOverlay>

      <ModalOverlay
        isOpen={confirm !== null && selected !== null}
        isDismissable={!pending}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        className={ui.overlay}
      >
        <Modal className={ui.dialog}>
          <Dialog role="alertdialog" className="flex flex-col gap-4 outline-none">
            <Heading slot="title" className={ui.dialogTitle}>
              {confirm === "delete"
                ? t("admin.discounts.deleteTitle", { code: selected?.code ?? "" })
                : t("admin.discounts.disableTitle", { code: selected?.code ?? "" })}
            </Heading>
            <p className="leading-relaxed">{t(confirm === "delete" ? "admin.discounts.deleteBody" : "admin.discounts.disableBody")}</p>
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
                  const target = selected;
                  const action = confirm;
                  if (target === null || action === null) return;
                  startTransition(async () => {
                    const result = action === "delete" ? await deleteDiscountCode(target.id) : await disableDiscountCode(target.id);
                    if (result.ok) {
                      setConfirm(null);
                      // Codul șters dispare din listă: se închide și fereastra lui.
                      if (action === "delete") setOpenId(null);
                    } else {
                      setError(t(`errors.${result.error}`));
                    }
                  });
                }}
              >
                {t(confirm === "delete" ? "admin.discounts.delete" : "admin.discounts.disable")}
              </Button>
            </div>
          </Dialog>
        </Modal>
      </ModalOverlay>
    </section>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteRetentionOption, upsertRetentionOption } from "@/lib/actions/admin";
import { t, tp, type MessageKey } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { Sheet } from "../ui/Sheet";
import { SheetActions } from "../ui/SheetActions";

export interface CatalogRow {
  id: string;
  months: number;
  surchargeMinor: number;
  active: boolean;
  usedBy: number;
}

function errorText(result: { error: string; fields?: Record<string, string> }): string {
  const field = result.fields ? Object.values(result.fields)[0] : undefined;
  return field ? t(field as MessageKey) : t(`errors.${result.error}` as MessageKey);
}

/** O opțiune a catalogului, ca foaie: suplimentul, activarea, câte evenimente o folosesc, acțiunile jos. */
function OptionSheet({ option }: { option: CatalogRow }) {
  const router = useRouter();
  const [surcharge, setSurcharge] = useState(String(option.surchargeMinor / 100));
  const [active, setActive] = useState(option.active);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const inputId = `surcharge-${option.id}`;

  return (
    <Sheet
      id={`option-${option.id}`}
      title={tp("plural.months", option.months)}
      aside={!option.active && <span className="text-accent">{t("admin.retentionPage.inactive")}</span>}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className={ui.label}>
          {t("admin.retentionPage.surcharge")}
        </label>
        <input
          id={inputId}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={surcharge}
          onChange={(e) => {
            setSurcharge(e.target.value);
          }}
          className={`${ui.input} ${ui.data}`}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => {
              setActive(e.target.checked);
            }}
            className={ui.checkbox}
          />
          {t("admin.retentionPage.active")}
        </label>
        <span className="text-sm text-ink-muted">
          {option.usedBy === 0 ? t("admin.retentionPage.unused") : tp("plural.usedByEvents", option.usedBy)}
        </span>
      </div>

      <SheetActions
        status={
          message && (
            <p role="status" className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}>
              {message.text}
            </p>
          )
        }
      >
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await deleteRetentionOption(option.id);
              if (result.ok) router.refresh();
              else
                setMessage({
                  text: result.error === "OPTION_IN_USE" ? t("admin.retentionPage.inUse") : errorText(result),
                  ok: false,
                });
            });
          }}
          className={ui.buttonDanger}
        >
          {t("admin.retentionPage.delete")}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await upsertRetentionOption({
                id: option.id,
                months: option.months,
                surchargeLei: surcharge.replace(",", "."),
                active,
              });
              setMessage(result.ok ? { text: t("admin.retentionPage.saved"), ok: true } : { text: errorText(result), ok: false });
              if (result.ok) router.refresh();
            });
          }}
          className={ui.buttonSecondary}
        >
          {t("admin.retentionPage.save")}
        </button>
      </SheetActions>
    </Sheet>
  );
}

/**
 * Catalogul de retenție (FR-038) ca foi pe o grilă de două coloane: câte una pe opțiune, apoi
 * foaia de adăugare. Cu un număr impar de opțiuni, foaia de adăugare umple golul de pe ultimul
 * rând; altfel ocupă tot rândul.
 */
export function RetentionCatalog({ options }: { options: CatalogRow[] }) {
  const router = useRouter();
  const [months, setMonths] = useState("");
  const [surcharge, setSurcharge] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {options.length === 0 && <p className="text-ink-muted lg:col-span-2">{t("admin.retentionPage.empty")}</p>}
      {options.map((o) => (
        <OptionSheet key={`${o.id}-${String(o.surchargeMinor)}-${String(o.active)}`} option={o} />
      ))}

      <Sheet id="add-option-title" title={t("admin.retentionPage.add")} className={options.length % 2 === 0 ? "lg:col-span-2" : ""}>
        <form
          className={ui.sheetForm}
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await upsertRetentionOption({ months, surchargeLei: surcharge.replace(",", "."), active: true });
              if (result.ok) {
                setMonths("");
                setSurcharge("");
                router.refresh();
              } else {
                setError(errorText(result));
              }
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-months" className={ui.label}>
                {t("admin.retentionPage.monthsInput")}
              </label>
              <input
                id="new-months"
                type="number"
                min={1}
                max={60}
                value={months}
                onChange={(e) => {
                  setMonths(e.target.value);
                }}
                className={`${ui.input} ${ui.data}`}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-surcharge" className={ui.label}>
                {t("admin.retentionPage.surcharge")}
              </label>
              <input
                id="new-surcharge"
                type="number"
                min={0}
                step="0.01"
                value={surcharge}
                onChange={(e) => {
                  setSurcharge(e.target.value);
                }}
                className={`${ui.input} ${ui.data}`}
              />
            </div>
          </div>
          <SheetActions
            status={
              error !== null && (
                <p role="alert" className={ui.fieldError}>
                  {error}
                </p>
              )
            }
          >
            <button type="submit" disabled={pending} className={ui.buttonPrimary}>
              {t("admin.retentionPage.create")}
            </button>
          </SheetActions>
        </form>
      </Sheet>
    </div>
  );
}

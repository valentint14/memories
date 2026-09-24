"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteRetentionOption, upsertRetentionOption } from "@/lib/actions/admin";
import { t, tp, type MessageKey } from "@/lib/i18n";

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

function OptionRow({ option }: { option: CatalogRow }) {
  const router = useRouter();
  const [surcharge, setSurcharge] = useState(String(option.surchargeMinor / 100));
  const [active, setActive] = useState(option.active);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const label = tp("plural.months", option.months);

  return (
    <tr className="border-b border-gray-200">
      <th scope="row" className="p-2 font-medium">
        {label}
      </th>
      <td className="p-2">
        <label className="sr-only" htmlFor={`surcharge-${option.id}`}>
          {t("admin.retentionPage.surcharge")}
        </label>
        <input
          id={`surcharge-${option.id}`}
          aria-label={t("admin.retentionPage.surcharge")}
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={surcharge}
          onChange={(e) => {
            setSurcharge(e.target.value);
          }}
          className="min-h-11 w-28 rounded-lg border border-gray-400 px-2"
        />
      </td>
      <td className="p-2">
        <input
          type="checkbox"
          aria-label={t("admin.retentionPage.active")}
          checked={active}
          onChange={(e) => {
            setActive(e.target.checked);
          }}
          className="h-6 w-6"
        />
      </td>
      <td className="p-2">{option.usedBy}</td>
      <td className="p-2">
        <div className="flex flex-wrap items-center gap-2">
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
            className="min-h-11 rounded-lg border border-brand-600 px-3 font-semibold text-brand-700"
          >
            {t("admin.retentionPage.save")}
          </button>
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
            className="min-h-11 rounded-lg border border-danger px-3 font-semibold text-danger"
          >
            {t("admin.retentionPage.delete")}
          </button>
          {message && (
            <span role="status" className={message.ok ? "text-success" : "text-danger"}>
              {message.text}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

/** Tabelul editabil al catalogului de retenție (FR-038). */
export function RetentionCatalog({ options }: { options: CatalogRow[] }) {
  const router = useRouter();
  const [months, setMonths] = useState("");
  const [surcharge, setSurcharge] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-300">
              <th scope="col" className="p-2">{t("admin.retentionPage.months")}</th>
              <th scope="col" className="p-2">{t("admin.retentionPage.surcharge")}</th>
              <th scope="col" className="p-2">{t("admin.retentionPage.active")}</th>
              <th scope="col" className="p-2">{t("admin.retentionPage.usedBy")}</th>
              <th scope="col" className="p-2">{t("admin.retentionPage.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {options.map((o) => (
              <OptionRow key={`${o.id}-${String(o.surchargeMinor)}-${String(o.active)}`} option={o} />
            ))}
          </tbody>
        </table>
      </div>

      <form
        className="flex flex-wrap items-end gap-3"
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
        <fieldset className="flex flex-wrap items-end gap-3">
          <legend className="mb-2 font-semibold">{t("admin.retentionPage.add")}</legend>
          <label className="flex flex-col gap-1">
            {t("admin.retentionPage.monthsInput")}
            <input
              type="number"
              min={1}
              max={60}
              value={months}
              onChange={(e) => {
                setMonths(e.target.value);
              }}
              className="min-h-11 w-28 rounded-lg border border-gray-400 px-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            {t("admin.retentionPage.surcharge")}
            <input
              type="number"
              min={0}
              step="0.01"
              value={surcharge}
              onChange={(e) => {
                setSurcharge(e.target.value);
              }}
              className="min-h-11 w-28 rounded-lg border border-gray-400 px-2"
            />
          </label>
          <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-brand-600 px-4 font-semibold text-white">
            {t("admin.retentionPage.create")}
          </button>
        </fieldset>
        {error !== null && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}

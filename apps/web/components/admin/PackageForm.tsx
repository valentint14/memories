"use client";

import { useState, useTransition } from "react";
import { updatePackage } from "@/lib/actions/admin";
import { t, tp, type MessageKey } from "@/lib/i18n";
import type { PackageSettings } from "@/lib/admin/package";

const MB = 1024 * 1024;
const inputClass = "min-h-11 rounded-lg border border-gray-400 px-3 aria-[invalid=true]:border-danger";

/** Configurarea pachetului complet și a limitei de evenimente în așteptare (002: FR-015). */
export function PackageForm({
  initial,
  options,
}: {
  initial: PackageSettings;
  options: { id: string; months: number }[];
}) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function field(id: string, name: string, label: MessageKey, props: React.InputHTMLAttributes<HTMLInputElement>) {
    const message = fields[name];
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="font-medium">
          {t(label)}
        </label>
        <input id={id} name={name} aria-invalid={message !== undefined} aria-describedby={`${id}-error`} className={inputClass} {...props} />
        {message !== undefined && (
          <p id={`${id}-error`} className="text-sm text-danger">
            {t(message as MessageKey)}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const text = (name: string) => {
          const value = data.get(name);
          return typeof value === "string" ? value : "";
        };
        setSaved(false);
        setError(null);
        startTransition(async () => {
          const result = await updatePackage({
            priceLei: text("priceLei"),
            maxFilesPerGuest: text("maxFilesPerGuest"),
            maxPhotoMb: text("maxPhotoMb"),
            maxVideoMb: text("maxVideoMb"),
            retentionOptionId: text("retentionOptionId"),
            maxAwaitingEventsPerOrganizer: text("maxAwaitingEventsPerOrganizer"),
          });
          if (result.ok) {
            setFields({});
            setSaved(true);
          } else if (result.fields) {
            setFields(result.fields);
          } else {
            setError(t(`errors.${result.error}`));
          }
        });
      }}
    >
      {field("pk-price", "priceLei", "admin.package.price", { type: "number", min: 0, step: "0.01", defaultValue: initial.priceMinor / 100 })}
      {field("pk-files", "maxFilesPerGuest", "admin.package.maxFiles", { type: "number", min: 1, max: 1000, defaultValue: initial.maxFilesPerGuest })}
      {field("pk-photo", "maxPhotoMb", "admin.package.maxPhotoMb", { type: "number", min: 1, max: 50, defaultValue: initial.maxPhotoBytes / MB })}
      {field("pk-video", "maxVideoMb", "admin.package.maxVideoMb", { type: "number", min: 1, max: 1024, defaultValue: initial.maxVideoBytes / MB })}
      <div className="flex flex-col gap-1">
        <label htmlFor="pk-option" className="font-medium">
          {t("admin.package.retention")}
        </label>
        <select
          id="pk-option"
          name="retentionOptionId"
          defaultValue={initial.retentionOptionId ?? ""}
          aria-invalid={fields.retentionOptionId !== undefined}
          className={inputClass}
        >
          <option value="" disabled>
            {t("admin.package.choose")}
          </option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {tp("plural.months", o.months)}
            </option>
          ))}
        </select>
        {fields.retentionOptionId !== undefined && <p className="text-sm text-danger">{t(fields.retentionOptionId as MessageKey)}</p>}
      </div>
      {field("pk-awaiting", "maxAwaitingEventsPerOrganizer", "admin.package.maxAwaiting", {
        type: "number",
        min: 1,
        max: 20,
        defaultValue: initial.maxAwaitingEventsPerOrganizer,
      })}
      {saved && (
        <p role="status" className="text-green-800">
          {t("admin.package.saved")}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="min-h-11 self-start rounded-lg bg-brand-600 px-4 font-semibold text-white disabled:opacity-60">
        {t("admin.package.save")}
      </button>
    </form>
  );
}

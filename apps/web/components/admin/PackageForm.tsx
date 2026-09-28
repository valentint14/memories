"use client";

import { useState, useTransition } from "react";
import { SelectField } from "@/components/ui/SelectField";
import { updatePackage } from "@/lib/actions/admin";
import { t, tp, type MessageKey } from "@/lib/i18n";
import type { PackageSettings } from "@/lib/admin/package";
import { ui } from "@/lib/ui";

const MB = 1024 * 1024;
const inputClass = ui.input;

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
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className={ui.label}>
          {t(label)}
        </label>
        <input id={id} name={name} aria-invalid={message !== undefined} aria-describedby={`${id}-error`} className={inputClass} {...props} />
        {message !== undefined && (
          <p id={`${id}-error`} className={ui.fieldError}>
            {t(message as MessageKey)}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      noValidate
      className="flex max-w-xl flex-col gap-5 border-t border-ink pt-6"
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
      <div className="flex flex-col gap-1.5">
        <SelectField
          name="retentionOptionId"
          label={t("admin.package.retention")}
          placeholder={t("admin.package.choose")}
          defaultValue={initial.retentionOptionId ?? undefined}
          isInvalid={fields.retentionOptionId !== undefined}
          options={options.map((o) => ({ id: o.id, label: tp("plural.months", o.months) }))}
        />
        {fields.retentionOptionId !== undefined && <p className={ui.fieldError}>{t(fields.retentionOptionId as MessageKey)}</p>}
      </div>
      {field("pk-awaiting", "maxAwaitingEventsPerOrganizer", "admin.package.maxAwaiting", {
        type: "number",
        min: 1,
        max: 20,
        defaultValue: initial.maxAwaitingEventsPerOrganizer,
      })}
      {saved && (
        <p role="status" className="text-success">
          {t("admin.package.saved")}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${ui.buttonPrimary} self-start`}>
        {t("admin.package.save")}
      </button>
    </form>
  );
}

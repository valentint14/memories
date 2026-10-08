"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { SelectField } from "@/components/ui/SelectField";
import { SheetActions } from "@/components/ui/SheetActions";
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
  const router = useRouter();
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
      className="flex flex-col gap-6"
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
            // Banda de deasupra arată valorile salvate: o citim din nou.
            router.refresh();
          } else if (result.fields) {
            setFields(result.fields);
          } else {
            setError(t(`errors.${result.error}`));
          }
        });
      }}
    >
      {/* Trei foi egale, pe un rând pe ecrane late; un singur formular, salvat o dată. */}
      <div className="flex flex-col gap-6">
        <Sheet id="pk-pricing-title" title={t("admin.package.sheet.pricing")}>
          {field("pk-price", "priceLei", "admin.package.price", { type: "number", min: 0, step: "0.01", defaultValue: initial.priceMinor / 100 })}
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
        </Sheet>

        <Sheet id="pk-limits-title" title={t("admin.package.sheet.limits")}>
          {field("pk-files", "maxFilesPerGuest", "admin.package.maxFiles", { type: "number", min: 1, max: 1000, defaultValue: initial.maxFilesPerGuest })}
          {field("pk-photo", "maxPhotoMb", "admin.package.maxPhotoMb", { type: "number", min: 1, max: 50, defaultValue: initial.maxPhotoBytes / MB })}
          {field("pk-video", "maxVideoMb", "admin.package.maxVideoMb", { type: "number", min: 1, max: 1024, defaultValue: initial.maxVideoBytes / MB })}
        </Sheet>

        <Sheet id="pk-self-service-title" title={t("admin.package.sheet.selfService")}>
          {field("pk-awaiting", "maxAwaitingEventsPerOrganizer", "admin.package.maxAwaiting", {
            type: "number",
            min: 1,
            max: 20,
            defaultValue: initial.maxAwaitingEventsPerOrganizer,
          })}
        </Sheet>
      </div>

      {/* Sub foi, după aceeași regulă ca bara de acțiuni a unei foi. */}
      <SheetActions
        status={
          <>
            {saved && (
              <p role="status" className="text-sm text-success">
                {t("admin.package.saved")}
              </p>
            )}
            {error !== null && (
              <p role="alert" className={ui.fieldError}>
                {error}
              </p>
            )}
          </>
        }
      >
        <button type="submit" disabled={pending} className={ui.buttonPrimary}>
          {t("admin.package.save")}
        </button>
      </SheetActions>
    </form>
  );
}

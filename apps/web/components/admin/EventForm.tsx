"use client";

import { computePurgeAt, finalPriceMinor, leiToMinor } from "@memories/shared";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button, FieldError, Form, Input, Label, Text, TextField } from "react-aria-components";
import { createEvent, updateEvent } from "@/lib/actions/admin";
import { isoToLocalInput, localInputToIso } from "@/lib/dates";
import { formatDateTime, formatMoney, t, type MessageKey } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { DateField } from "../ui/DateField";
import { SelectField } from "../ui/SelectField";
import { Sheet } from "../ui/Sheet";
import { SheetActions } from "../ui/SheetActions";

export interface RetentionOptionView {
  id: string;
  months: number;
  surchargeMinor: number;
}

export interface EventFormInitial {
  eventId: string;
  name: string;
  eventDate: string;
  organizerEmail: string;
  uploadStartsAt: string;
  uploadEndsAt: string;
  maxFilesPerGuest: number;
  maxPhotoBytes: number;
  maxVideoBytes: number;
  basePriceMinor: number;
  retentionOptionId: string;
}

const MB = 1024 * 1024;
const fieldClass = "flex flex-col gap-1.5";
const inputClass = ui.input;
const errorClass = ui.fieldError;

function optionLabel(o: RetentionOptionView): string {
  return o.surchargeMinor === 0
    ? t("admin.form.retentionIncluded", { months: o.months })
    : t("admin.form.retentionWithSurcharge", { months: o.months, price: formatMoney(o.surchargeMinor) });
}

/**
 * Formularul de creare/editare a unui eveniment (FR-001–FR-003, FR-039, FR-040). Câmpurile sunt
 * definite o dată și așezate fie pe o grilă simplă (`grid`, editarea din fișa evenimentului), fie
 * în patru foi pe două coloane (`sheets`, pagina „Eveniment nou”).
 */
export function EventForm({
  options,
  initial,
  fill = false,
  layout = "grid",
}: {
  options: RetentionOptionView[];
  initial?: EventFormInitial;
  /** Într-o foaie: formularul umple lățimea foii (altfel, cel mult `max-w-3xl`). */
  fill?: boolean;
  layout?: "grid" | "sheets";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [basePriceLei, setBasePriceLei] = useState(initial ? String(initial.basePriceMinor / 100) : "");
  const [uploadEndsLocal, setUploadEndsLocal] = useState(initial ? isoToLocalInput(initial.uploadEndsAt) : "");
  const [optionId, setOptionId] = useState<string>(initial?.retentionOptionId ?? options[0]?.id ?? "");

  const option = options.find((o) => o.id === optionId);
  const preview = useMemo(() => {
    const base = Number(basePriceLei.replace(",", "."));
    const endIso = localInputToIso(uploadEndsLocal);
    return {
      price: option && Number.isFinite(base) && base >= 0 ? formatMoney(finalPriceMinor(leiToMinor(base), option.surchargeMinor)) : "—",
      purgeAt: option && endIso !== "" ? formatDateTime(computePurgeAt(new Date(endIso), option.months)) : "—",
    };
  }, [basePriceLei, uploadEndsLocal, option]);

  const messageFor = (key: string): string => t(key as MessageKey);
  const sheets = layout === "sheets";
  // Pe grilă, numele ocupă tot rândul; în foi, câmpurile stau unul sub altul.
  const wide = sheets ? "" : "sm:col-span-2";

  const nameField = (
    <TextField name="name" defaultValue={initial?.name} className={`${fieldClass} ${wide}`}>
      <Label className="font-medium">{t("admin.form.name")}</Label>
      <Input className={inputClass} maxLength={120} />
      <FieldError className={errorClass} />
    </TextField>
  );
  const eventDateField = (
    <DateField name="eventDate" label={t("admin.form.eventDate")} labelClassName="font-medium" defaultValue={initial?.eventDate} />
  );
  const organizerField = (
    <TextField name="organizerEmail" type="email" defaultValue={initial?.organizerEmail} className={fieldClass}>
      <Label className="font-medium">{t("admin.form.organizerEmail")}</Label>
      <Input className={inputClass} autoComplete="off" />
      <FieldError className={errorClass} />
    </TextField>
  );
  const startsField = (
    <DateField
      name="uploadStartsAt"
      granularity="minute"
      label={t("admin.form.uploadStartsAt")}
      labelClassName="font-medium"
      {...(initial && { defaultValue: isoToLocalInput(initial.uploadStartsAt) })}
    />
  );
  const endsField = (
    <DateField
      name="uploadEndsAt"
      granularity="minute"
      label={t("admin.form.uploadEndsAt")}
      labelClassName="font-medium"
      value={uploadEndsLocal}
      onChange={setUploadEndsLocal}
    />
  );
  const maxFilesField = (
    <TextField name="maxFilesPerGuest" type="number" defaultValue={String(initial?.maxFilesPerGuest ?? 50)} className={fieldClass}>
      <Label className="font-medium">{t("admin.form.maxFiles")}</Label>
      <Input className={inputClass} min={1} max={1000} />
      <FieldError className={errorClass} />
    </TextField>
  );
  const maxPhotoField = (
    <TextField name="maxPhotoMb" type="number" defaultValue={String(initial ? initial.maxPhotoBytes / MB : 50)} className={fieldClass}>
      <Label className="font-medium">{t("admin.form.maxPhotoMb")}</Label>
      <Input className={inputClass} min={1} max={50} step="any" />
      <Text slot="description" className={ui.hint}>
        {t("admin.form.maxPhotoHint")}
      </Text>
      <FieldError className={errorClass} />
    </TextField>
  );
  const maxVideoField = (
    <TextField name="maxVideoMb" type="number" defaultValue={String(initial ? initial.maxVideoBytes / MB : 1024)} className={fieldClass}>
      <Label className="font-medium">{t("admin.form.maxVideoMb")}</Label>
      <Input className={inputClass} min={1} max={1024} step="any" />
      <Text slot="description" className={ui.hint}>
        {t("admin.form.maxVideoHint")}
      </Text>
      <FieldError className={errorClass} />
    </TextField>
  );
  const basePriceField = (
    <TextField name="basePriceLei" type="number" value={basePriceLei} onChange={setBasePriceLei} className={fieldClass}>
      <Label className="font-medium">{t("admin.form.basePrice")}</Label>
      <Input className={inputClass} min={0} step="0.01" inputMode="decimal" />
      <FieldError className={errorClass} />
    </TextField>
  );
  const retentionField = (
    <SelectField
      name="retentionOptionId"
      label={t("admin.form.retention")}
      value={optionId}
      onChange={setOptionId}
      options={options.map((o) => ({ id: o.id, label: optionLabel(o) }))}
    />
  );
  const previewBox = (
    <div
      className={sheets ? "flex flex-col gap-1 border-t border-rule pt-4" : "flex flex-col gap-1 border-y border-ink py-4 sm:col-span-2"}
      aria-live="polite"
    >
      <p>
        {t("admin.form.finalPrice")}{" "}
        <strong data-testid="price-preview" className={ui.data}>
          {preview.price}
        </strong>
      </p>
      <p>
        {t("admin.form.purgeAt")}{" "}
        <strong data-testid="purge-preview" className={ui.data}>
          {preview.purgeAt}
        </strong>
      </p>
    </div>
  );
  const submitLabel = initial ? t("admin.form.save") : t("admin.form.create");

  return (
    <Form
      validationBehavior="aria"
      validationErrors={Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, messageFor(v)]))}
      className={sheets ? "flex flex-col gap-6" : `grid gap-5 sm:grid-cols-2 ${fill ? "" : "max-w-3xl"}`}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const get = (name: string) => {
          const v = fd.get(name);
          return typeof v === "string" ? v : "";
        };
        const input = {
          name: get("name"),
          eventDate: get("eventDate"),
          organizerEmail: get("organizerEmail"),
          uploadStartsAt: localInputToIso(get("uploadStartsAt")),
          uploadEndsAt: localInputToIso(get("uploadEndsAt")),
          maxFilesPerGuest: get("maxFilesPerGuest"),
          maxPhotoMb: get("maxPhotoMb").replace(",", "."),
          maxVideoMb: get("maxVideoMb").replace(",", "."),
          basePriceLei: get("basePriceLei").replace(",", "."),
          retentionOptionId: optionId,
        };
        setErrors({});
        setFormError(null);
        startTransition(async () => {
          const result = initial ? await updateEvent(initial.eventId, input) : await createEvent(input);
          if (result.ok) {
            router.push(`/admin/events/${result.data.eventId}`);
            router.refresh();
          } else if (result.fields) {
            setErrors(result.fields);
          } else {
            setFormError(t(`errors.${result.error}`));
          }
        });
      }}
    >
      {sheets ? (
        <>
          {/* Patru foi egale pe două coloane; butonul de trimitere stă sub ele, la dreapta. */}
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Sheet id="ef-event-title" title={t("admin.form.sheet.event")}>
              {nameField}
              {eventDateField}
              {organizerField}
            </Sheet>
            <Sheet id="ef-uploads-title" title={t("admin.form.sheet.uploads")}>
              {startsField}
              {endsField}
              <p className={ui.hint}>{t("admin.form.uploadsHint")}</p>
            </Sheet>
            <Sheet id="ef-limits-title" title={t("admin.package.sheet.limits")}>
              {maxFilesField}
              {maxPhotoField}
              {maxVideoField}
            </Sheet>
            <Sheet id="ef-pricing-title" title={t("admin.package.sheet.pricing")}>
              {basePriceField}
              {retentionField}
              {previewBox}
            </Sheet>
          </div>
          {/* Sub foi, după aceeași regulă ca bara de acțiuni a unei foi. */}
          <SheetActions
            status={
              formError !== null && (
                <p role="alert" className={ui.fieldError}>
                  {formError}
                </p>
              )
            }
          >
            <Button type="submit" isDisabled={pending} className={ui.buttonPrimary}>
              {submitLabel}
            </Button>
          </SheetActions>
        </>
      ) : (
        <>
          {nameField}
          {eventDateField}
          {organizerField}
          {startsField}
          {endsField}
          {maxFilesField}
          {maxPhotoField}
          {maxVideoField}
          {basePriceField}
          {retentionField}
          {previewBox}
          {formError !== null && (
            <p role="alert" className="text-danger sm:col-span-2">
              {formError}
            </p>
          )}
          <div className="sm:col-span-2">
            <SheetActions>
              {/* La editare, pagina are deja acțiunea principală (starea evenimentului). */}
              <Button type="submit" isDisabled={pending} className={initial ? ui.buttonSecondary : ui.buttonPrimary}>
                {submitLabel}
              </Button>
            </SheetActions>
          </div>
        </>
      )}
    </Form>
  );
}

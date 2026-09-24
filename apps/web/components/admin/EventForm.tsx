"use client";

import { computePurgeAt, finalPriceMinor, leiToMinor } from "@memories/shared";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Button,
  FieldError,
  Form,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
  Text,
  TextField,
} from "react-aria-components";
import { createEvent, updateEvent } from "@/lib/actions/admin";
import { isoToLocalInput, localInputToIso } from "@/lib/dates";
import { formatDateTime, formatMoney, t, type MessageKey } from "@/lib/i18n";

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
const fieldClass = "flex flex-col gap-1";
const inputClass = "min-h-11 rounded-lg border border-gray-400 px-3 text-base invalid:border-danger";
const errorClass = "text-sm text-danger";

function optionLabel(o: RetentionOptionView): string {
  return o.surchargeMinor === 0
    ? t("admin.form.retentionIncluded", { months: o.months })
    : t("admin.form.retentionWithSurcharge", { months: o.months, price: formatMoney(o.surchargeMinor) });
}

/** Formularul de creare/editare a unui eveniment (FR-001–FR-003, FR-039, FR-040). */
export function EventForm({ options, initial }: { options: RetentionOptionView[]; initial?: EventFormInitial }) {
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

  return (
    <Form
      validationBehavior="aria"
      validationErrors={Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, messageFor(v)]))}
      className="grid max-w-3xl gap-5 sm:grid-cols-2"
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
      <TextField name="name" defaultValue={initial?.name} className={`${fieldClass} sm:col-span-2`}>
        <Label className="font-medium">{t("admin.form.name")}</Label>
        <Input className={inputClass} maxLength={120} />
        <FieldError className={errorClass} />
      </TextField>

      <TextField name="eventDate" type="date" defaultValue={initial?.eventDate} className={fieldClass}>
        <Label className="font-medium">{t("admin.form.eventDate")}</Label>
        <Input className={inputClass} />
        <FieldError className={errorClass} />
      </TextField>

      <TextField name="organizerEmail" type="email" defaultValue={initial?.organizerEmail} className={fieldClass}>
        <Label className="font-medium">{t("admin.form.organizerEmail")}</Label>
        <Input className={inputClass} autoComplete="off" />
        <FieldError className={errorClass} />
      </TextField>

      <TextField
        name="uploadStartsAt"
        type="datetime-local"
        defaultValue={initial ? isoToLocalInput(initial.uploadStartsAt) : undefined}
        className={fieldClass}
      >
        <Label className="font-medium">{t("admin.form.uploadStartsAt")}</Label>
        <Input className={inputClass} />
        <FieldError className={errorClass} />
      </TextField>

      <TextField
        name="uploadEndsAt"
        type="datetime-local"
        value={uploadEndsLocal}
        onChange={setUploadEndsLocal}
        className={fieldClass}
      >
        <Label className="font-medium">{t("admin.form.uploadEndsAt")}</Label>
        <Input className={inputClass} />
        <FieldError className={errorClass} />
      </TextField>

      <TextField
        name="maxFilesPerGuest"
        type="number"
        defaultValue={String(initial?.maxFilesPerGuest ?? 50)}
        className={fieldClass}
      >
        <Label className="font-medium">{t("admin.form.maxFiles")}</Label>
        <Input className={inputClass} min={1} max={1000} />
        <FieldError className={errorClass} />
      </TextField>

      <TextField
        name="maxPhotoMb"
        type="number"
        defaultValue={String(initial ? initial.maxPhotoBytes / MB : 50)}
        className={fieldClass}
      >
        <Label className="font-medium">{t("admin.form.maxPhotoMb")}</Label>
        <Input className={inputClass} min={1} max={50} step="any" />
        <Text slot="description" className="text-sm text-muted">
          {t("admin.form.maxPhotoHint")}
        </Text>
        <FieldError className={errorClass} />
      </TextField>

      <TextField
        name="maxVideoMb"
        type="number"
        defaultValue={String(initial ? initial.maxVideoBytes / MB : 1024)}
        className={fieldClass}
      >
        <Label className="font-medium">{t("admin.form.maxVideoMb")}</Label>
        <Input className={inputClass} min={1} max={1024} step="any" />
        <Text slot="description" className="text-sm text-muted">
          {t("admin.form.maxVideoHint")}
        </Text>
        <FieldError className={errorClass} />
      </TextField>

      <TextField name="basePriceLei" type="number" value={basePriceLei} onChange={setBasePriceLei} className={fieldClass}>
        <Label className="font-medium">{t("admin.form.basePrice")}</Label>
        <Input className={inputClass} min={0} step="0.01" inputMode="decimal" />
        <FieldError className={errorClass} />
      </TextField>

      <Select
        name="retentionOptionId"
        value={optionId}
        onChange={(key) => {
          if (key !== null) setOptionId(String(key));
        }}
        className={fieldClass}
      >
        <Label className="font-medium">{t("admin.form.retention")}</Label>
        <Button className={`${inputClass} flex items-center justify-between gap-2 text-left`}>
          <SelectValue />
          <span aria-hidden="true">▾</span>
        </Button>
        <FieldError className={errorClass} />
        <Popover className="min-w-(--trigger-width) rounded-lg border border-gray-300 bg-white shadow-lg">
          <ListBox className="p-1">
            {options.map((o) => (
              <ListBoxItem
                key={o.id}
                id={o.id}
                textValue={optionLabel(o)}
                className="cursor-pointer rounded px-3 py-2 outline-none data-focused:bg-brand-50 data-selected:font-semibold"
              >
                {optionLabel(o)}
              </ListBoxItem>
            ))}
          </ListBox>
        </Popover>
      </Select>

      <div className="rounded-lg bg-brand-50 p-4 sm:col-span-2" aria-live="polite">
        <p>
          {t("admin.form.finalPrice")}{" "}
          <strong data-testid="price-preview">{preview.price}</strong>
        </p>
        <p>
          {t("admin.form.purgeAt")}{" "}
          <strong data-testid="purge-preview">{preview.purgeAt}</strong>
        </p>
      </div>

      {formError !== null && (
        <p role="alert" className="text-danger sm:col-span-2">
          {formError}
        </p>
      )}

      <div className="sm:col-span-2">
        <Button
          type="submit"
          isDisabled={pending}
          className="min-h-11 rounded-lg bg-brand-600 px-6 font-semibold text-white disabled:opacity-60"
        >
          {initial ? t("admin.form.save") : t("admin.form.create")}
        </Button>
      </div>
    </Form>
  );
}

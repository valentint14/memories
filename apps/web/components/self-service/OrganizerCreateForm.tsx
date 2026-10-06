"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createEventForm } from "@/lib/actions/organizer";
import type { FormState } from "@/lib/actions/self-service";
import { t, type MessageKey } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { DateField } from "../ui/DateField";
import { SheetActions } from "../ui/SheetActions";

/**
 * Crearea unui eveniment de către un organizator autentificat, fără email (002: FR-005). Caseta de
 * acceptare apare doar dacă nu a acceptat încă versiunea curentă a documentelor (FR-041).
 */
export function OrganizerCreateForm({
  minDate,
  maxDate,
  versions,
}: {
  minDate: string;
  maxDate: string;
  /** Versiunile curente, doar dacă trebuie acceptate. */
  versions: { terms: string; privacy: string } | null;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createEventForm, { status: "idle" });
  const fields = state.status === "error" ? (state.fields ?? {}) : {};
  const general = state.status === "error" && state.error !== "VALIDATION" ? state.error : undefined;
  const values = state.status === "error" ? (state.values ?? {}) : {};

  return (
    <form action={action} noValidate className={ui.sheetForm}>
      {versions !== null && (
        <>
          <input type="hidden" name="termsVersion" value={versions.terms} />
          <input type="hidden" name="privacyVersion" value={versions.privacy} />
        </>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="oc-name" className={ui.label}>
          {t("home.name")}
        </label>
        <input
          id="oc-name"
          name="name"
          type="text"
          defaultValue={values.name}
          required
          maxLength={120}
          aria-invalid={fields.name !== undefined}
          aria-describedby="oc-name-error"
          className={ui.input}
        />
        {fields.name !== undefined && (
          <p id="oc-name-error" className={ui.fieldError}>
            {t(fields.name as MessageKey)}
          </p>
        )}
      </div>
      <DateField
        label={t("home.date")}
        name="eventDate"
        defaultValue={values.eventDate}
        isRequired
        minValue={minDate}
        maxValue={maxDate}
        isInvalid={fields.eventDate !== undefined}
        {...(fields.eventDate !== undefined && { errorMessage: t(fields.eventDate as MessageKey) })}
      />
      {versions !== null && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start gap-3">
            <input
              id="oc-accept"
              name="accepted"
              type="checkbox"
              defaultChecked={values.accepted === "on"}
              required
              aria-invalid={fields.accepted !== undefined}
              aria-describedby="oc-accept-error"
              className={`${ui.checkbox} mt-0.5`}
            />
            <label htmlFor="oc-accept" className="leading-snug">
              {t("home.acceptBefore")}
              <Link href="/terms" target="_blank" className={ui.link}>
                {t("home.terms")}
              </Link>
              {t("home.acceptMiddle")}
              <Link href="/privacy" target="_blank" className={ui.link}>
                {t("home.privacy")}
              </Link>
            </label>
          </div>
          {fields.accepted !== undefined && (
            <p id="oc-accept-error" className={ui.fieldError}>
              {t(fields.accepted as MessageKey)}
            </p>
          )}
        </div>
      )}
      <SheetActions
        status={
          general !== undefined && (
            <p role="alert" className={ui.alert}>
              {t(`errors.${general}`)}
            </p>
          )
        }
      >
        <button type="submit" disabled={pending} className={ui.buttonPrimary}>
          {pending ? t("home.submitting") : t("home.submit")}
        </button>
      </SheetActions>
    </form>
  );
}

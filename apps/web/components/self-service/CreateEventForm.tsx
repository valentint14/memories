"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { requestEventCreationForm, type FormState } from "@/lib/actions/self-service";
import { t, type MessageKey } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { SheetActions } from "../ui/SheetActions";

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (message === undefined) return null;
  return (
    <p id={id} className={ui.fieldError}>
      {t(message as MessageKey)}
    </p>
  );
}

/**
 * Formularul de creare de pe pagina principală (002: FR-001, FR-002): formular nativ cu Server
 * Action, erori lângă câmpuri, caseta de acceptare nebifată implicit, capcană ascunsă pentru boți.
 */
export function CreateEventForm({
  termsVersion,
  privacyVersion,
  minDate,
  maxDate,
  turnstile,
}: {
  termsVersion: string;
  privacyVersion: string;
  minDate: string;
  maxDate: string;
  turnstile: ReactNode;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestEventCreationForm, { status: "idle" });
  const fields = state.status === "error" ? (state.fields ?? {}) : {};
  const general = state.status === "error" && state.error !== "VALIDATION" ? state.error : undefined;
  const values = state.status === "error" ? (state.values ?? {}) : {};

  return (
    <form action={action} noValidate className={ui.sheetForm}>
      <input type="hidden" name="termsVersion" value={termsVersion} />
      <input type="hidden" name="privacyVersion" value={privacyVersion} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ss-email" className={ui.label}>
          {t("home.email")}
        </label>
        <input
          id="ss-email"
          name="email"
          type="email"
          defaultValue={values.email}
          required
          autoComplete="email"
          aria-invalid={fields.email !== undefined}
          aria-describedby="ss-email-hint ss-email-error"
          className={ui.input}
        />
        <p id="ss-email-hint" className={ui.hint}>
          {t("home.emailHint")}
        </p>
        <FieldError id="ss-email-error" message={fields.email} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ss-name" className={ui.label}>
          {t("home.name")}
        </label>
        <input
          id="ss-name"
          name="name"
          type="text"
          defaultValue={values.name}
          required
          maxLength={120}
          aria-invalid={fields.name !== undefined}
          aria-describedby="ss-name-error"
          className={ui.input}
        />
        <FieldError id="ss-name-error" message={fields.name} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="ss-date" className={ui.label}>
          {t("home.date")}
        </label>
        <input
          id="ss-date"
          name="eventDate"
          type="date"
          defaultValue={values.eventDate}
          required
          min={minDate}
          max={maxDate}
          aria-invalid={fields.eventDate !== undefined}
          aria-describedby="ss-date-error"
          className={`${ui.input} ${ui.data}`}
        />
        <FieldError id="ss-date-error" message={fields.eventDate} />
      </div>

      {/* Capcană pentru boți: ascunsă vizual și pentru cititoarele de ecran. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="ss-website">{t("home.website")}</label>
        <input id="ss-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-3">
          <input
            id="ss-accept"
            name="accepted"
            type="checkbox"
            defaultChecked={values.accepted === "on"}
            required
            aria-invalid={fields.accepted !== undefined}
            aria-describedby="ss-accept-error"
            className={`${ui.checkbox} mt-0.5`}
          />
          <label htmlFor="ss-accept" className="leading-snug">
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
        <FieldError id="ss-accept-error" message={fields.accepted} />
      </div>

      {turnstile}

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

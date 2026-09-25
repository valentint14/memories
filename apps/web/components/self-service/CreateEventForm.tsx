"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { requestEventCreationForm, type FormState } from "@/lib/actions/self-service";
import { t, type MessageKey } from "@/lib/i18n";

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (message === undefined) return null;
  return (
    <p id={id} className="text-sm text-danger">
      {t(message as MessageKey)}
    </p>
  );
}

const inputClass = "min-h-11 rounded-lg border border-gray-400 px-3 text-base aria-[invalid=true]:border-danger";

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
    <form action={action} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="termsVersion" value={termsVersion} />
      <input type="hidden" name="privacyVersion" value={privacyVersion} />

      <div className="flex flex-col gap-1">
        <label htmlFor="ss-email" className="font-medium">
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
          className={inputClass}
        />
        <p id="ss-email-hint" className="text-sm text-muted">
          {t("home.emailHint")}
        </p>
        <FieldError id="ss-email-error" message={fields.email} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ss-name" className="font-medium">
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
          className={inputClass}
        />
        <FieldError id="ss-name-error" message={fields.name} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ss-date" className="font-medium">
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
          className={inputClass}
        />
        <FieldError id="ss-date-error" message={fields.eventDate} />
      </div>

      {/* Capcană pentru boți: ascunsă vizual și pentru cititoarele de ecran. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="ss-website">{t("home.website")}</label>
        <input id="ss-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-start gap-3">
          <input
            id="ss-accept"
            name="accepted"
            type="checkbox"
            defaultChecked={values.accepted === "on"}
            required
            aria-invalid={fields.accepted !== undefined}
            aria-describedby="ss-accept-error"
            className="mt-1 size-5 shrink-0 accent-brand-600"
          />
          <label htmlFor="ss-accept">
            {t("home.acceptBefore")}
            <Link href="/terms" target="_blank" className="text-brand-700 underline">
              {t("home.terms")}
            </Link>
            {t("home.acceptMiddle")}
            <Link href="/privacy" target="_blank" className="text-brand-700 underline">
              {t("home.privacy")}
            </Link>
          </label>
        </div>
        <FieldError id="ss-accept-error" message={fields.accepted} />
      </div>

      {turnstile}

      {general !== undefined && (
        <p role="alert" className="rounded-lg border border-danger p-3 text-danger">
          {t(`errors.${general}`)}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg bg-brand-600 px-4 font-semibold text-white disabled:opacity-60"
      >
        {pending ? t("home.submitting") : t("home.submit")}
      </button>
    </form>
  );
}

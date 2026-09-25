"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createEventForm } from "@/lib/actions/organizer";
import type { FormState } from "@/lib/actions/self-service";
import { t, type MessageKey } from "@/lib/i18n";

const inputClass = "min-h-11 rounded-lg border border-gray-400 px-3 text-base aria-[invalid=true]:border-danger";

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

  return (
    <form action={action} noValidate className="flex flex-col gap-4">
      {versions !== null && (
        <>
          <input type="hidden" name="termsVersion" value={versions.terms} />
          <input type="hidden" name="privacyVersion" value={versions.privacy} />
        </>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="oc-name" className="font-medium">
          {t("home.name")}
        </label>
        <input
          id="oc-name"
          name="name"
          type="text"
          required
          maxLength={120}
          aria-invalid={fields.name !== undefined}
          aria-describedby="oc-name-error"
          className={inputClass}
        />
        {fields.name !== undefined && (
          <p id="oc-name-error" className="text-sm text-danger">
            {t(fields.name as MessageKey)}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="oc-date" className="font-medium">
          {t("home.date")}
        </label>
        <input
          id="oc-date"
          name="eventDate"
          type="date"
          required
          min={minDate}
          max={maxDate}
          aria-invalid={fields.eventDate !== undefined}
          aria-describedby="oc-date-error"
          className={inputClass}
        />
        {fields.eventDate !== undefined && (
          <p id="oc-date-error" className="text-sm text-danger">
            {t(fields.eventDate as MessageKey)}
          </p>
        )}
      </div>
      {versions !== null && (
        <div className="flex flex-col gap-1">
          <div className="flex items-start gap-3">
            <input
              id="oc-accept"
              name="accepted"
              type="checkbox"
              required
              aria-invalid={fields.accepted !== undefined}
              aria-describedby="oc-accept-error"
              className="mt-1 size-5 shrink-0 accent-brand-600"
            />
            <label htmlFor="oc-accept">
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
          {fields.accepted !== undefined && (
            <p id="oc-accept-error" className="text-sm text-danger">
              {t(fields.accepted as MessageKey)}
            </p>
          )}
        </div>
      )}
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

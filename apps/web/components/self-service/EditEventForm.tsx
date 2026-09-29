"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateOwnEvent } from "@/lib/actions/organizer";
import { t, type MessageKey } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { SheetActions } from "../ui/SheetActions";

/** Modificarea numelui și a datei de către organizator (002: FR-033). */
export function EditEventForm({ eventId, name, eventDate }: { eventId: string; name: string; eventDate: string }) {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      noValidate
      className={ui.sheetForm}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const text = (key: string) => {
          const value = data.get(key);
          return typeof value === "string" ? value : "";
        };
        setSaved(false);
        setError(null);
        startTransition(async () => {
          const result = await updateOwnEvent({ eventId, name: text("name"), eventDate: text("eventDate") });
          if (result.ok) {
            setFields({});
            setSaved(true);
            router.refresh();
          } else if (result.fields) {
            setFields(result.fields);
          } else {
            setError(t(`errors.${result.error}`));
          }
        });
      }}
    >
      <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-name" className={ui.label}>
            {t("home.name")}
          </label>
          <input
            id="edit-name"
            name="name"
            defaultValue={name}
            required
            maxLength={120}
            aria-invalid={fields.name !== undefined}
            className={ui.input}
          />
          {fields.name !== undefined && <p className={ui.fieldError}>{t(fields.name as MessageKey)}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="edit-date" className={ui.label}>
            {t("home.date")}
          </label>
          <input
            id="edit-date"
            name="eventDate"
            type="date"
            defaultValue={eventDate}
            required
            aria-invalid={fields.eventDate !== undefined}
            className={`${ui.input} ${ui.data}`}
          />
          {fields.eventDate !== undefined && <p className={ui.fieldError}>{t(fields.eventDate as MessageKey)}</p>}
        </div>
      </div>
      <SheetActions
        status={
          <>
            {saved && (
              <p role="status" className="text-sm text-success">
                {t("organizer.edit.saved")}
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
        <button type="submit" disabled={pending} className={ui.buttonSecondary}>
          {t("organizer.edit.save")}
        </button>
      </SheetActions>
    </form>
  );
}

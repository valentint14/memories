"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateOwnEvent } from "@/lib/actions/organizer";
import { t, type MessageKey } from "@/lib/i18n";

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
      className="flex flex-col gap-4"
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
      <div className="flex flex-col gap-1">
        <label htmlFor="edit-name" className="font-medium">
          {t("home.name")}
        </label>
        <input
          id="edit-name"
          name="name"
          defaultValue={name}
          required
          maxLength={120}
          aria-invalid={fields.name !== undefined}
          className="min-h-11 rounded-lg border border-gray-400 px-3"
        />
        {fields.name !== undefined && <p className="text-sm text-danger">{t(fields.name as MessageKey)}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="edit-date" className="font-medium">
          {t("home.date")}
        </label>
        <input
          id="edit-date"
          name="eventDate"
          type="date"
          defaultValue={eventDate}
          required
          aria-invalid={fields.eventDate !== undefined}
          className="min-h-11 rounded-lg border border-gray-400 px-3"
        />
        {fields.eventDate !== undefined && <p className="text-sm text-danger">{t(fields.eventDate as MessageKey)}</p>}
      </div>
      {saved && (
        <p role="status" className="text-sm text-green-800">
          {t("organizer.edit.saved")}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="min-h-11 self-start rounded-lg bg-brand-600 px-4 font-semibold text-white disabled:opacity-60">
        {t("organizer.edit.save")}
      </button>
    </form>
  );
}

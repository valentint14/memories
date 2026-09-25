"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updatePendingEvent } from "@/lib/actions/admin";
import { t, type MessageKey } from "@/lib/i18n";

/** Editarea unui eveniment neactivat: doar numele și data (002: FR-028). */
export function PendingEventForm({ eventId, name, eventDate }: { eventId: string; name: string; eventDate: string }) {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const text = (name: string) => {
          const value = data.get(name);
          return typeof value === "string" ? value : "";
        };
        setSaved(false);
        startTransition(async () => {
          const result = await updatePendingEvent({
            eventId,
            name: text("name"),
            eventDate: text("eventDate"),
          });
          if (result.ok) {
            setFields({});
            setSaved(true);
            router.refresh();
          } else {
            setFields(result.fields ?? { name: `errors.${result.error}` });
          }
        });
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="pe-name" className="font-medium">
          {t("home.name")}
        </label>
        <input id="pe-name" name="name" defaultValue={name} required maxLength={120} className="min-h-11 rounded-lg border border-gray-400 px-3" />
        {fields.name !== undefined && <p className="text-sm text-danger">{t(fields.name as MessageKey)}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="pe-date" className="font-medium">
          {t("home.date")}
        </label>
        <input id="pe-date" name="eventDate" type="date" defaultValue={eventDate} required className="min-h-11 rounded-lg border border-gray-400 px-3" />
        {fields.eventDate !== undefined && <p className="text-sm text-danger">{t(fields.eventDate as MessageKey)}</p>}
      </div>
      {saved && (
        <p role="status" className="text-sm text-green-800">
          {t("admin.pendingEdit.saved")}
        </p>
      )}
      <button type="submit" disabled={pending} className="min-h-11 self-start rounded-lg bg-brand-600 px-4 font-semibold text-white disabled:opacity-60">
        {t("admin.pendingEdit.save")}
      </button>
    </form>
  );
}

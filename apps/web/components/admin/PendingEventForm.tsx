"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updatePendingEvent } from "@/lib/actions/admin";
import { t, type MessageKey } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { SheetActions } from "../ui/SheetActions";

/** Editarea unui eveniment neactivat: doar numele și data (002: FR-028). */
export function PendingEventForm({ eventId, name, eventDate }: { eventId: string; name: string; eventDate: string }) {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className={ui.sheetForm}
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
      <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pe-name" className={ui.label}>
            {t("home.name")}
          </label>
          <input id="pe-name" name="name" defaultValue={name} required maxLength={120} className={ui.input} />
          {fields.name !== undefined && <p className={ui.fieldError}>{t(fields.name as MessageKey)}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pe-date" className={ui.label}>
            {t("home.date")}
          </label>
          <input id="pe-date" name="eventDate" type="date" defaultValue={eventDate} required className={`${ui.input} ${ui.data}`} />
          {fields.eventDate !== undefined && <p className={ui.fieldError}>{t(fields.eventDate as MessageKey)}</p>}
        </div>
      </div>
      <SheetActions
        status={
          saved && (
            <p role="status" className="text-sm text-success">
              {t("admin.pendingEdit.saved")}
            </p>
          )
        }
      >
        <button type="submit" disabled={pending} className={ui.buttonSecondary}>
          {t("admin.pendingEdit.save")}
        </button>
      </SheetActions>
    </form>
  );
}

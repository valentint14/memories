import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import { DeleteEventDialog } from "./DeleteEventDialog";
import { EditEventForm } from "./EditEventForm";

/**
 * Modificarea și ștergerea evenimentului de către organizator (002: FR-033, FR-035). În suspendare
 * se poate doar șterge (FR-028a).
 */
export function ManageEventSection({
  eventId,
  name,
  eventDate,
  canEdit,
}: {
  eventId: string;
  name: string;
  eventDate: string;
  canEdit: boolean;
}) {
  return (
    <section aria-labelledby="manage-title" className={ui.section}>
      <h2 id="manage-title" className={ui.kicker}>
        {t("organizer.manage.title")}
      </h2>
      {canEdit && <EditEventForm eventId={eventId} name={name} eventDate={eventDate} />}
      <div className="flex flex-col gap-3 border-t border-rule pt-4">
        <p className={ui.hint}>{t("organizer.delete.explain")}</p>
        <DeleteEventDialog eventId={eventId} eventName={name} />
      </div>
    </section>
  );
}

import { t } from "@/lib/i18n";
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
    <section aria-labelledby="manage-title" className="flex flex-col gap-4 rounded-lg border border-gray-200 p-4">
      <h2 id="manage-title" className="text-lg font-semibold">
        {t("organizer.manage.title")}
      </h2>
      {canEdit && <EditEventForm eventId={eventId} name={name} eventDate={eventDate} />}
      <div className="flex flex-col gap-2 border-t border-gray-200 pt-4">
        <p className="text-sm text-muted">{t("organizer.delete.explain")}</p>
        <DeleteEventDialog eventId={eventId} eventName={name} />
      </div>
    </section>
  );
}

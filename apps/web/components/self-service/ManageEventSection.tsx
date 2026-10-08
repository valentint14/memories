import { t } from "@/lib/i18n";
import { Sheet } from "../ui/Sheet";
import { SheetActions } from "../ui/SheetActions";
import { DeleteEventDialog } from "./DeleteEventDialog";
import { EditEventForm } from "./EditEventForm";

/**
 * Modificarea și ștergerea evenimentului de către organizator (002: FR-033, FR-035), ca două foi
 * alăturate. În suspendare se poate doar șterge (FR-028a): foaia de ștergere ocupă tot rândul.
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
    <div className="grid items-start gap-6 lg:grid-cols-2">
      {canEdit && (
        <Sheet id="manage-title" title={t("organizer.manage.title")}>
          <EditEventForm eventId={eventId} name={name} eventDate={eventDate} />
        </Sheet>
      )}
      <Sheet id="delete-title" title={t("admin.delete.section")} danger className={canEdit ? "" : "lg:col-span-2"}>
        <p className={canEdit ? "" : "max-w-2xl"}>{t("organizer.delete.explain")}</p>
        <SheetActions>
          <DeleteEventDialog eventId={eventId} eventName={name} />
        </SheetActions>
      </Sheet>
    </div>
  );
}

import { t } from "@/lib/i18n";
import { Sheet } from "../ui/Sheet";
import { SheetActions } from "../ui/SheetActions";
import { DeleteEventDialog } from "./DeleteEventDialog";
import { EditEventForm } from "./EditEventForm";

/**
 * Modificarea și ștergerea evenimentului de către organizator (002: FR-033, FR-035), ca două foi,
 * una sub alta. În suspendare se poate doar șterge (FR-028a): rămâne doar foaia de ștergere.
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
    <div className="flex flex-col gap-6">
      {canEdit && (
        <Sheet id="manage-title" title={t("organizer.manage.title")}>
          <EditEventForm eventId={eventId} name={name} eventDate={eventDate} />
        </Sheet>
      )}
      <Sheet id="delete-title" title={t("admin.delete.section")} danger>
        <p>{t("organizer.delete.explain")}</p>
        <SheetActions>
          <DeleteEventDialog eventId={eventId} eventName={name} />
        </SheetActions>
      </Sheet>
    </div>
  );
}

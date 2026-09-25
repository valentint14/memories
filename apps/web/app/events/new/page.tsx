import type { Metadata } from "next";
import { OrganizerCreateForm } from "@/components/self-service/OrganizerCreateForm";
import { t } from "@/lib/i18n";
import { organizerCreateFormProps } from "@/lib/organizer/create";

export const metadata: Metadata = { title: "Eveniment nou" };

/** Crearea unui eveniment din cont (002: FR-005). */
export default async function NewEventPage() {
  const props = await organizerCreateFormProps();
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("organizer.newTitle")}</h1>
      <p className="text-muted">{t("organizer.newIntro")}</p>
      <OrganizerCreateForm {...props} />
    </div>
  );
}

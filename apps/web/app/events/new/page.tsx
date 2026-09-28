import type { Metadata } from "next";
import { OrganizerCreateForm } from "@/components/self-service/OrganizerCreateForm";
import { t } from "@/lib/i18n";
import { organizerCreateFormProps } from "@/lib/organizer/create";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Eveniment nou" };

/** Crearea unui eveniment din cont (002: FR-005). */
export default async function NewEventPage() {
  const props = await organizerCreateFormProps();
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className={ui.pageTitle}>{t("organizer.newTitle")}</h1>
      <p className="leading-relaxed text-ink-muted">{t("organizer.newIntro")}</p>
      <OrganizerCreateForm {...props} />
    </div>
  );
}

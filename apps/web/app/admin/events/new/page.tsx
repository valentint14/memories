import type { Metadata } from "next";
import { EventForm } from "@/components/admin/EventForm";
import { listActiveRetentionOptions } from "@/lib/admin/queries";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Eveniment nou" };

export default async function NewEventPage() {
  const options = await listActiveRetentionOptions();
  return (
    <div className="flex flex-col gap-8">
      <h1 className={ui.pageTitle}>{t("admin.newEvent")}</h1>
      <EventForm options={options} />
    </div>
  );
}

import type { Metadata } from "next";
import { EventForm } from "@/components/admin/EventForm";
import { listActiveRetentionOptions } from "@/lib/admin/queries";
import { t } from "@/lib/i18n";

export const metadata: Metadata = { title: "Eveniment nou" };

export default async function NewEventPage() {
  const options = await listActiveRetentionOptions();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("admin.newEvent")}</h1>
      <EventForm options={options} />
    </div>
  );
}

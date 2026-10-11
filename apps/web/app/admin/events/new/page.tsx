import type { Metadata } from "next";
import Link from "next/link";
import { EventForm } from "@/components/admin/EventForm";
import { listActiveRetentionOptions } from "@/lib/admin/queries";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Eveniment nou" };

/** Crearea unui eveniment de către administrator, în formatul fișelor: antet și patru foi. */
export default async function NewEventPage() {
  const options = await listActiveRetentionOptions();
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <p className={`${ui.kicker} text-ink-muted`}>
          <Link href="/admin/events" className="underline decoration-rule underline-offset-4 hover:decoration-ink">
            {t("admin.events")}
          </Link>
        </p>
        <h1 className={ui.pageTitle}>{t("admin.newEvent")}</h1>
        <p className="max-w-2xl leading-relaxed text-ink-muted">{t("admin.newEventIntro")}</p>
      </header>
      <EventForm options={options} layout="sheets" />
    </div>
  );
}

import type { Metadata } from "next";
import { OrganizerCreateForm } from "@/components/self-service/OrganizerCreateForm";
import { Sheet } from "@/components/ui/Sheet";
import { t } from "@/lib/i18n";
import { organizerCreateFormProps } from "@/lib/organizer/create";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Eveniment nou" };

const STEPS = ["organizer.new.step1", "organizer.new.step2", "organizer.new.step3"] as const;

/**
 * Crearea unui eveniment din cont (002: FR-005), în formatul fișelor: formularul și pașii de după
 * creare, ca două foi egale. Formularul e același ca pe pagina principală; aici umple foaia, iar
 * butonul coboară la marginea ei de jos, aliniat la dreapta.
 */
export default async function NewEventPage() {
  const props = await organizerCreateFormProps();
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className={ui.pageTitle}>{t("organizer.newTitle")}</h1>
        <p className="max-w-2xl leading-relaxed text-ink-muted">{t("organizer.newIntro")}</p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Sheet
          id="new-event-title"
          title={t("organizer.new.formSheet")}
        >
          <OrganizerCreateForm {...props} />
        </Sheet>
        <Sheet id="next-steps-title" title={t("organizer.new.nextSheet")}>
          <ol className="flex flex-col">
            {STEPS.map((key, i) => (
              <li key={key} className="flex gap-5 border-b border-rule py-4 first:pt-0 last:border-b-0 last:pb-0">
                <span className={`${ui.data} pt-0.5 text-sm text-accent`}>{String(i + 1).padStart(2, "0")}</span>
                <span className="leading-relaxed">{t(key)}</span>
              </li>
            ))}
          </ol>
        </Sheet>
      </div>
    </div>
  );
}

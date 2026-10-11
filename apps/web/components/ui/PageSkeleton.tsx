import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

const bar = "animate-pulse rounded-xs bg-rule";

/**
 * Schelet afișat cât timp se încarcă o pagină din zona organizatorului sau a administratorului:
 * titlul și o foaie cu rânduri, în aceeași formă ca paginile reale. Doar tokeni și linii, fără
 * culori noi; animația se oprește singură la `prefers-reduced-motion` (globals.css).
 */
export function PageSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{t("loading.label")}</span>
      <div aria-hidden="true" className={`${bar} h-12 w-2/3 max-w-md`} />
      <div aria-hidden="true" className={ui.sheet}>
        <div className="border-b border-rule px-4 py-3">
          <div className={`${bar} h-4 w-32`} />
        </div>
        <div className={ui.sheetBody}>
          <div className={`${bar} h-5 w-full`} />
          <div className={`${bar} h-5 w-5/6`} />
          <div className={`${bar} h-5 w-2/3`} />
        </div>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { ui } from "@/lib/ui";

/**
 * Bara de acțiuni a unei foi: toate butoanele dintr-o foaie stau aici, după aceeași regulă (imediat
 * după conținut; pe ecrane late la dreapta, cu acțiunea principală ultima; pe telefon pe toată
 * lățimea, cu principala sus). `status` (salvat, eroare) stă chiar deasupra butoanelor.
 */
export function SheetActions({ status, children }: { status?: ReactNode; children: ReactNode }) {
  // Aceeași structură cu sau fără mesaj: butoanele nu se remontează (nu pierd focusul) după salvare.
  return (
    <div className="flex flex-col gap-4">
      {status}
      <div className={ui.sheetActions}>{children}</div>
    </div>
  );
}

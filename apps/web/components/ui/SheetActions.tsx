import type { ReactNode } from "react";
import { ui } from "@/lib/ui";

/**
 * Bara de acțiuni a unei foi: toate butoanele dintr-o foaie stau aici, după aceeași regulă (la
 * baza foii; pe ecrane late la dreapta, cu acțiunea principală ultima; pe telefon pe toată
 * lățimea, cu principala sus). `status` (salvat, eroare) stă chiar deasupra butoanelor.
 *
 * Coboară la baza foii doar dacă părintele e coloana foii (`Sheet`) sau un formular `ui.sheetForm`.
 */
export function SheetActions({ status, children }: { status?: ReactNode; children: ReactNode }) {
  // Aceeași structură cu sau fără mesaj: butoanele nu se remontează (nu pierd focusul) după salvare.
  return (
    <div className="mt-auto flex flex-col gap-4">
      {status}
      <div className={ui.sheetActions}>{children}</div>
    </div>
  );
}

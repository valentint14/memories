"use client";

import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

/** Deschide dialogul de tipărire al browserului (și „Salvează ca PDF”) pentru pagina curentă. */
export function PrintButton() {
  return (
    <button
      type="button"
      className={ui.buttonSecondaryCompact}
      onClick={() => {
        window.print();
      }}
    >
      {t("legal.print")}
    </button>
  );
}

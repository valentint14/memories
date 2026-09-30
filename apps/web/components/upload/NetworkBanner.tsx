"use client";

import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

/**
 * Anunțul de pauză din cauza rețelei (US6-2), citit de cititoarele de ecran. Regiunea rămâne în
 * pagină și goală (ca anunțul să fie citit când apare); cât e goală, `-mt-6` anulează spațiul
 * (`gap-6`) pe care l-ar lăsa în coloana paginii.
 */
export function NetworkBanner({ offline }: { offline: boolean }) {
  return (
    <div aria-live="polite" className="empty:-mt-6">
      {offline && <p className={ui.caution}>{t("upload.offlineBanner")}</p>}
    </div>
  );
}

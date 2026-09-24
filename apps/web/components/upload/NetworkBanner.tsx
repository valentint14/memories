"use client";

import { t } from "@/lib/i18n";

/** Anunțul de pauză din cauza rețelei (US6-2), citit de cititoarele de ecran. */
export function NetworkBanner({ offline }: { offline: boolean }) {
  return (
    <div aria-live="polite">
      {offline && (
        <p className="rounded-lg border border-amber-600 bg-amber-50 p-3 text-ink">{t("upload.offlineBanner")}</p>
      )}
    </div>
  );
}

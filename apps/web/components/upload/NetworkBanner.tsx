"use client";

import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

/** Anunțul de pauză din cauza rețelei (US6-2), citit de cititoarele de ecran. */
export function NetworkBanner({ offline }: { offline: boolean }) {
  return <div aria-live="polite">{offline && <p className={ui.caution}>{t("upload.offlineBanner")}</p>}</div>;
}

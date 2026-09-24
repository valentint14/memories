"use client";

import { useEffect } from "react";
import { t } from "@/lib/i18n";

/**
 * Rugămintea de a ține pagina deschisă cât timp există uploaduri active (FR-016b), plus
 * avertizarea browserului la închiderea paginii.
 */
export function KeepOpenNotice({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [active]);

  if (!active) return null;
  return <p className="rounded-lg bg-brand-50 p-3 text-sm font-medium">{t("upload.keepOpen")}</p>;
}

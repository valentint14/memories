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
  return (
    <p className="flex items-center gap-2 text-sm font-medium">
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent" />
      {t("upload.keepOpen")}
    </p>
  );
}

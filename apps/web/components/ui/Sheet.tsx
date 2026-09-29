import type { ReactNode } from "react";
import { ui } from "@/lib/ui";

/**
 * O foaie (fișa unui eveniment, catalogul de retenție): ramă subțire, banda cu titlul sus,
 * conținutul dedesubt. Foile de pe același rând al grilei au aceeași înălțime; `danger` e pentru
 * ștergere, iar `aside` stă în dreapta benzii (de ex. „Inactivă”).
 */
export function Sheet({
  id,
  title,
  aside,
  danger = false,
  className = "",
  children,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  danger?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={`${danger ? ui.sheetDanger : ui.sheet} ${className}`}>
      <div className={`flex items-center justify-between gap-3 ${danger ? ui.sheetTitleDanger : ui.sheetTitle}`}>
        <h2 id={id}>{title}</h2>
        {aside}
      </div>
      <div className={ui.sheetBody}>{children}</div>
    </section>
  );
}

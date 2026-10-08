import type { ReactNode } from "react";
import { ui } from "@/lib/ui";
import { SiteHeader } from "../nav/SiteHeader";

/**
 * Paginile de autentificare (login, cod, confirmare), în formatul fișelor: bara publică, antetul
 * cu titlu și text, apoi foile, una sub alta în coloana unică (`ui.pageColumn`).
 */
export function AuthPage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <SiteHeader context="public" />
      <main className={ui.pageColumn}>
        <header className="flex flex-col gap-3">
          <h1 className={ui.pageTitle}>{title}</h1>
          {intro}
        </header>
        {children}
      </main>
    </div>
  );
}

/** Textul de sub titlu, la aceeași lățime pe toate paginile. */
export const authIntro = "max-w-2xl leading-relaxed text-ink-muted";

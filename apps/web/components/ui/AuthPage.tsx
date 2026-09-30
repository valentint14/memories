import type { ReactNode } from "react";
import { ui } from "@/lib/ui";
import { SiteHeader } from "../nav/SiteHeader";

/**
 * Paginile de autentificare (login, cod, confirmare), în formatul fișelor: bara publică, antetul
 * cu titlu și text, apoi foile (de obicei două, egale, una lângă alta de la `lg`).
 */
export function AuthPage({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <SiteHeader context="public" />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-8 sm:py-10">
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

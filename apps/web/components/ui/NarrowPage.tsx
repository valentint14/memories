import type { ReactNode } from "react";
import { ui } from "@/lib/ui";
import { Wordmark } from "./Wordmark";

/** Pagină îngustă (autentificare, confirmare): numele produsului sus, conținutul pe mijloc. */
export function NarrowPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-10 px-4 py-6 sm:px-6">
      <Wordmark />
      <main className="flex flex-1 flex-col justify-center gap-6 pb-16">
        <h1 className={ui.pageTitle}>{title}</h1>
        {children}
      </main>
    </div>
  );
}

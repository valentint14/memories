"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";
import "./globals.css";

/**
 * Ultima plasă: o eroare în chiar layout-ul rădăcină. Înlocuiește tot documentul, deci își aduce
 * singură `<html>` și stilurile; fonturile din layout lipsesc, iar tokenii cad pe fonturile de sistem.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ro">
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">
        <main id="continut" className={ui.pageColumn}>
          <header className="flex flex-col gap-3">
            <h1 className={ui.pageTitle}>{t("error.title")}</h1>
            <p role="alert" className="max-w-2xl leading-relaxed text-ink-muted">
              {t("error.body")}
            </p>
          </header>
          <div>
            <button type="button" onClick={reset} className={ui.buttonPrimary}>
              {t("error.retry")}
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}

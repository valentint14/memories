"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";
import { Wordmark } from "@/components/ui/Wordmark";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

/**
 * Eroarea neprevăzută a unei pagini, în aceeași formă ca restul aplicației. Mesajul e general:
 * detaliile tehnice nu ajung la utilizator, ci în Sentry (datele personale sunt șterse de `scrub`).
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-dvh">
      <div className="border-b border-rule bg-paper">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-8">
          <Wordmark trim />
        </div>
      </div>
      <main className={ui.pageColumn}>
        <header className="flex flex-col gap-3">
          <h1 className={ui.pageTitle}>{t("error.title")}</h1>
          <p role="alert" className="max-w-2xl leading-relaxed text-ink-muted">
            {t("error.body")}
          </p>
        </header>
        <div className="flex flex-col gap-3 sm:flex-row-reverse sm:justify-start">
          <button type="button" onClick={reset} className={ui.buttonPrimary}>
            {t("error.retry")}
          </button>
          <Link href="/" className={ui.buttonSecondary}>
            {t("error.home")}
          </Link>
        </div>
      </main>
    </div>
  );
}

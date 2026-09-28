import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { TurnstileField } from "@/components/security/TurnstileField";
import { CreateEventForm } from "@/components/self-service/CreateEventForm";
import { OrganizerCreateForm } from "@/components/self-service/OrganizerCreateForm";
import { Wordmark } from "@/components/ui/Wordmark";
import { t } from "@/lib/i18n";
import { currentLegalVersions } from "@/lib/legal";
import { organizerCreateFormProps } from "@/lib/organizer/create";
import { serverSupabase } from "@/lib/supabase/server";
import { ui } from "@/lib/ui";
import { todayInAppZone } from "@/lib/validation/self-service";

export const metadata: Metadata = { title: { absolute: "Memories — pozele invitaților, într-un singur loc" } };

const STEPS = ["home.step1", "home.step2", "home.step3"] as const;

function Steps({ className }: { className: string }) {
  return (
    <section aria-label={t("home.stepsLabel")} className={`flex-col gap-6 ${className}`}>
      <ol className="flex flex-col border-t border-ink">
        {STEPS.map((key, i) => (
          <li key={key} className="flex gap-6 border-b border-rule py-4">
            <span className={`${ui.data} pt-0.5 text-sm text-accent`}>{String(i + 1).padStart(2, "0")}</span>
            <span className="leading-relaxed">{t(key)}</span>
          </li>
        ))}
      </ol>
      <p className="text-sm leading-relaxed text-ink-muted">{t("home.footnote")}</p>
    </section>
  );
}

/** Pagina principală: crearea self-service a unui eveniment (002/US1, FR-001). */
export default async function HomePage() {
  // Randare per cerere: nonce-ul CSP (proxy.ts) trebuie să ajungă pe scripturile paginii.
  await connection();
  // Un organizator autentificat creează direct în cont, fără email și fără verificare anti-bot (FR-005).
  const { data } = await (await serverSupabase()).auth.getUser();
  const signedInEmail = data.user?.email ?? null;
  const organizerProps = signedInEmail === null ? null : await organizerCreateFormProps();
  const versions = await currentLegalVersions();
  const today = todayInAppZone(new Date());
  const maxDate = `${String(Number(today.slice(0, 4)) + 2)}${today.slice(4)}`;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-rule">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-8">
          <Wordmark />
          <p className="text-sm text-ink-muted">
            {organizerProps === null ? (
              <>
                {t("home.haveAccount")}{" "}
                <Link href="/login" className={ui.link}>
                  {t("home.login")}
                </Link>
              </>
            ) : (
              <Link href="/events" className={ui.link}>
                {t("organizer.myEvents")}
              </Link>
            )}
          </p>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 sm:px-8 sm:py-14 lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col gap-6 lg:col-span-7 lg:pr-12">
          <p className={`${ui.kicker} text-accent`}>{t("home.title")}</p>
          <h1 className="font-serif text-5xl leading-[1.03] tracking-tight text-balance sm:text-6xl lg:text-7xl">
            {t("home.headline")}
          </h1>
          <p className="max-w-xl text-lg leading-relaxed">{t("home.intro")}</p>

          <Steps className="hidden max-w-xl lg:flex" />
        </div>

        <section
          aria-labelledby="create-title"
          className="flex flex-col gap-5 self-start rounded-xs border border-rule bg-paper-raised p-5 sm:p-8 lg:col-span-5"
        >
          <h2 id="create-title" className={ui.sectionTitle}>
            {t("home.formTitle")}
          </h2>
          {organizerProps === null ? (
            <CreateEventForm
              termsVersion={versions.terms}
              privacyVersion={versions.privacy}
              minDate={today}
              maxDate={maxDate}
              turnstile={<TurnstileField />}
            />
          ) : (
            <>
              <p className={ui.hint}>{t("home.loggedInAs", { email: signedInEmail ?? "" })}</p>
              <OrganizerCreateForm {...organizerProps} />
            </>
          )}
        </section>

        {/* Pe ecrane mici, pașii vin după formular: acțiunea rămâne sus. */}
        <Steps className="flex lg:hidden" />
      </main>
    </div>
  );
}

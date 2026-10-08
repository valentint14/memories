import type { Metadata } from "next";
import { connection } from "next/server";
import { SiteHeader } from "@/components/nav/SiteHeader";
import { TurnstileField } from "@/components/security/TurnstileField";
import { CreateEventForm } from "@/components/self-service/CreateEventForm";
import { OrganizerCreateForm } from "@/components/self-service/OrganizerCreateForm";
import { t } from "@/lib/i18n";
import { currentLegalVersions } from "@/lib/legal";
import { organizerCreateFormProps } from "@/lib/organizer/create";
import { serverSupabase } from "@/lib/supabase/server";
import { ui } from "@/lib/ui";
import { todayInAppZone } from "@/lib/validation/self-service";

export const metadata: Metadata = { title: { absolute: "Memories — pozele invitaților, într-un singur loc" } };

const STEPS = ["home.step1", "home.step2", "home.step3"] as const;

/** Cei trei pași: pe ecrane late, trei coloane egale, fiecare deschisă de o linie; pe telefon, una sub alta. */
function Steps() {
  return (
    <section aria-label={t("home.stepsLabel")} className="flex flex-col gap-6">
      <ol className="grid gap-6 sm:grid-cols-3">
        {STEPS.map((key, i) => (
          <li key={key} className="flex flex-col gap-2 border-t border-rule pt-4">
            <span className={`${ui.data} text-sm text-accent`}>{String(i + 1).padStart(2, "0")}</span>
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
      <SiteHeader context="public" email={signedInEmail} />

      {/* O singură coloană: prezentarea, formularul ca bandă pe toată lățimea, apoi pașii. */}
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-col gap-6">
          <p className={`${ui.kicker} text-accent`}>{t("home.title")}</p>
          <h1 className="font-serif text-5xl leading-[1.03] tracking-tight text-balance sm:text-6xl lg:text-7xl">
            {t("home.headline")}
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed">{t("home.intro")}</p>
        </div>

        {/* Formularul e o foaie ca oricare alta din aplicație: banda de titlu, apoi câmpurile. */}
        <section aria-labelledby="create-title" className={ui.sheet}>
          <h2 id="create-title" className={ui.sheetTitle}>
            {t("home.formTitle")}
          </h2>
          <div className={ui.sheetBody}>
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
          </div>
        </section>

        <Steps />
      </main>
    </div>
  );
}

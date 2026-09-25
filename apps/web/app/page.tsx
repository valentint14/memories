import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { TurnstileField } from "@/components/security/TurnstileField";
import { CreateEventForm } from "@/components/self-service/CreateEventForm";
import { OrganizerCreateForm } from "@/components/self-service/OrganizerCreateForm";
import { t } from "@/lib/i18n";
import { currentLegalVersions } from "@/lib/legal";
import { organizerCreateFormProps } from "@/lib/organizer/create";
import { serverSupabase } from "@/lib/supabase/server";
import { todayInAppZone } from "@/lib/validation/self-service";

export const metadata: Metadata = { title: { absolute: "Memories — pozele invitaților, într-un singur loc" } };

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
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-8 p-6 sm:py-12">
      <header className="flex flex-col gap-3">
        <p className="font-bold text-brand-700">Memories</p>
        <h1 className="text-3xl font-bold">{t("home.title")}</h1>
        <p className="text-muted">{t("home.intro")}</p>
      </header>

      <section aria-labelledby="create-title" className="flex flex-col gap-4 rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h2 id="create-title" className="text-xl font-semibold">
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
            <p className="text-sm text-muted">{t("home.loggedInAs", { email: signedInEmail ?? "" })}</p>
            <OrganizerCreateForm {...organizerProps} />
          </>
        )}
      </section>

      <p className="text-center text-sm">
        {organizerProps === null ? (
          <>
            {t("home.haveAccount")}{" "}
            <Link href="/login" className="font-semibold text-brand-700 underline">
              {t("home.login")}
            </Link>
          </>
        ) : (
          <Link href="/events" className="font-semibold text-brand-700 underline">
            {t("organizer.myEvents")}
          </Link>
        )}
      </p>
    </main>
  );
}

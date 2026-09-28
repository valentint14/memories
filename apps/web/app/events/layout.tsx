import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/ui/Wordmark";
import { t } from "@/lib/i18n";
import { serverSupabase } from "@/lib/supabase/server";
import { ui } from "@/lib/ui";

/** Zona organizatorului: cere autentificare (FR-008, FR-009). */
export default async function EventsLayout({ children }: { children: ReactNode }) {
  const supabase = await serverSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/events");
  // Sesiunea de admin înlocuiește în browser pe cea de organizator: spunem de ce lipsesc evenimentele.
  const { data: isAdminUser } = await supabase.rpc("is_platform_admin_user");

  return (
    <div className="min-h-dvh">
      <header className="border-b border-rule">
        <nav aria-label={t("organizer.nav")} className="mx-auto flex min-h-16 max-w-6xl items-center gap-8 px-4 sm:px-8">
          <Wordmark />
          <Link href="/events" className={ui.link}>
            {t("organizer.myEvents")}
          </Link>
        </nav>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-8 sm:py-10">
        {isAdminUser === true && (
          <p role="status" className={ui.caution}>
            {t("organizer.adminSession", { email: data.user.email ?? "" })}
          </p>
        )}
        <div>{children}</div>
      </main>
    </div>
  );
}

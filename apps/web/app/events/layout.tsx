import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";
import { serverSupabase } from "@/lib/supabase/server";

/** Zona organizatorului: cere autentificare (FR-008, FR-009). */
export default async function EventsLayout({ children }: { children: ReactNode }) {
  const supabase = await serverSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/events");
  // Sesiunea de admin înlocuiește în browser pe cea de organizator: spunem de ce lipsesc evenimentele.
  const { data: isAdminUser } = await supabase.rpc("is_platform_admin_user");

  return (
    <div className="min-h-dvh">
      <header className="border-b border-gray-200 bg-white">
        <nav aria-label={t("organizer.nav")} className="mx-auto flex max-w-6xl items-center gap-4 p-4">
          <Link href="/events" className="font-bold text-brand-700">
            {t("organizer.myEvents")}
          </Link>
        </nav>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
        {isAdminUser === true && (
          <p role="status" className="rounded-lg bg-amber-50 p-4 text-amber-900">
            {t("organizer.adminSession", { email: data.user.email ?? "" })}
          </p>
        )}
        <div>{children}</div>
      </main>
    </div>
  );
}

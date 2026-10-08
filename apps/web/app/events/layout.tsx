import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/nav/SiteHeader";
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
      <SiteHeader context="organizer" email={data.user.email ?? null} />
      <main className={ui.pageColumn}>
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

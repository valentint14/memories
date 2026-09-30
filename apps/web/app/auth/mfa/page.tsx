import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MfaForm } from "@/components/auth/MfaForm";
import { AuthPage, authIntro } from "@/components/ui/AuthPage";
import { adminAccess } from "@/lib/admin/guard";
import { t } from "@/lib/i18n";
import { serverSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Verificare în doi pași" };

/** Verificarea în doi pași a administratorului (FR-006a), în formatul fișelor. */
export default async function MfaPage() {
  const access = await adminAccess();
  if (access === "anonymous") redirect("/login?next=/auth/mfa");
  if (access === "not-admin") notFound();
  if (access === "admin") redirect("/admin/events");

  const supabase = await serverSupabase();
  const { data } = await supabase.auth.mfa.listFactors();
  const verified = data?.totp[0] ?? null;

  return (
    <AuthPage
      title={t("mfa.title")}
      intro={<p className={authIntro}>{verified === null ? t("mfa.introEnroll") : t("mfa.introVerify")}</p>}
    >
      <MfaForm factorId={verified?.id ?? null} />
    </AuthPage>
  );
}

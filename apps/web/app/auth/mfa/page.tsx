import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MfaForm } from "@/components/auth/MfaForm";
import { adminAccess } from "@/lib/admin/guard";
import { t } from "@/lib/i18n";
import { serverSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Verificare în doi pași" };

export default async function MfaPage() {
  const access = await adminAccess();
  if (access === "anonymous") redirect("/login?next=/auth/mfa");
  if (access === "not-admin") notFound();
  if (access === "admin") redirect("/admin/events");

  const supabase = await serverSupabase();
  const { data } = await supabase.auth.mfa.listFactors();
  const verified = data?.totp[0] ?? null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">{t("mfa.title")}</h1>
      <MfaForm factorId={verified?.id ?? null} />
    </main>
  );
}

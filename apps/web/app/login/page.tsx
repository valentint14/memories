import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/LoginForm";
import { t } from "@/lib/i18n";
import { safeNextPath } from "@/lib/security/redirect";

export const metadata: Metadata = { title: "Autentificare" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">{t("login.title")}</h1>
      <p className="text-muted">{t("login.intro")}</p>
      {params.error === "link" && (
        <p role="alert" className="rounded-lg border border-danger p-3 text-danger">
          {t("login.linkInvalid")}
        </p>
      )}
      <LoginForm next={safeNextPath(params.next)} />
    </main>
  );
}

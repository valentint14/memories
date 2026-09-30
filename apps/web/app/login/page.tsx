import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { TurnstileField } from "@/components/security/TurnstileField";
import { AuthPage, authIntro } from "@/components/ui/AuthPage";
import { StepList } from "@/components/ui/StepList";
import { Sheet } from "@/components/ui/Sheet";
import { t } from "@/lib/i18n";
import { safeNextPath } from "@/lib/security/redirect";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Autentificare" };

/**
 * Autentificarea (002: FR-007, FR-010), în formatul fișelor: formularul și pașii, ca două foi
 * egale (una sub alta pe telefon). Butonul coboară la marginea de jos a foii, aliniat la dreapta.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthPage title={t("login.title")} intro={<p className={authIntro}>{t("login.intro")}</p>}>
      {params.error === "link" && (
        <p role="alert" className={ui.alert}>
          {t("login.linkInvalid")}
        </p>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Sheet id="login-form-title" title={t("login.sheet.form")}>
          <LoginForm next={safeNextPath(params.next)} turnstile={<TurnstileField />} />
        </Sheet>
        <Sheet id="login-steps-title" title={t("login.sheet.steps")}>
          <StepList steps={[t("login.step1"), t("login.step2"), t("login.step3")]} />
        </Sheet>
      </div>
      <p className="text-sm text-ink-muted">
        {t("login.noAccount")}{" "}
        <Link href="/" className={ui.link}>
          {t("login.createEvent")}
        </Link>
      </p>
    </AuthPage>
  );
}

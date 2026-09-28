import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";
import { TurnstileField } from "@/components/security/TurnstileField";
import { NarrowPage } from "@/components/ui/NarrowPage";
import { t } from "@/lib/i18n";
import { safeNextPath } from "@/lib/security/redirect";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Autentificare" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <NarrowPage title={t("login.title")}>
      <p className="leading-relaxed text-ink-muted">{t("login.intro")}</p>
      {params.error === "link" && (
        <p role="alert" className={ui.alert}>
          {t("login.linkInvalid")}
        </p>
      )}
      <LoginForm next={safeNextPath(params.next)} turnstile={<TurnstileField />} />
      <p className="border-t border-rule pt-4 text-sm text-ink-muted">
        {t("login.noAccount")}{" "}
        <Link href="/" className={ui.link}>
          {t("login.createEvent")}
        </Link>
      </p>
    </NarrowPage>
  );
}

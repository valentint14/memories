import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmButton } from "@/components/self-service/ConfirmButton";
import { AuthPage, authIntro } from "@/components/ui/AuthPage";
import { StepList } from "@/components/ui/StepList";
import { Sheet } from "@/components/ui/Sheet";
import { t } from "@/lib/i18n";
import { safeNextPath } from "@/lib/security/redirect";
import { adminSupabase } from "@/lib/supabase/admin";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Confirmare" };

/**
 * Pagina deschisă din linkul din email (002: FR-007; research R2), în formatul fișelor: confirmarea
 * și explicația butonului, ca două foi egale. Deschiderea nu consumă tokenul: scanerele de email
 * văd doar pagina; confirmarea cere apăsarea butonului.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string; token_hash?: string; next?: string }>;
}) {
  const params = await searchParams;
  const tokenHash = params.token_hash ?? "";
  const requestId = /^[0-9a-f-]{36}$/i.test(params.request ?? "") ? (params.request ?? "") : "";

  let purpose: "create" | "login" = "login";
  let eventName: string | null = null;
  let usable = tokenHash !== "";
  if (usable && requestId !== "") {
    const { data } = await adminSupabase().rpc("auth_request_preview", { p_request_id: requestId });
    const preview = data?.[0];
    usable = preview !== undefined;
    purpose = preview?.purpose ?? "login";
    eventName = preview?.event_name ?? null;
  }
  const title = purpose === "create" ? t("confirm.createTitle") : t("confirm.loginTitle");

  if (!usable) {
    return (
      <AuthPage title={title}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Sheet id="confirm-invalid-title" title={t("confirm.sheet.invalid")} danger>
            <p role="alert" className="leading-relaxed">
              {t("confirm.invalid")}
            </p>
            <Link href="/login" className={`${ui.buttonSecondary} mt-auto self-end`}>
              {t("confirm.newRequest")}
            </Link>
          </Sheet>
          <Sheet id="confirm-next-title" title={t("confirm.sheet.next")}>
            <StepList steps={[t("confirm.next1"), t("confirm.next2")]} />
          </Sheet>
        </div>
      </AuthPage>
    );
  }

  const isCreate = purpose === "create" && eventName !== null;
  return (
    <AuthPage
      title={title}
      intro={<p className={authIntro}>{isCreate ? t("confirm.createIntro") : t("confirm.loginIntro")}</p>}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Sheet
          id="confirm-action-title"
          title={isCreate ? t("confirm.sheet.event") : t("confirm.sheet.login")}
          className="[&_form]:mt-auto [&_form]:self-end"
        >
          {isCreate ? (
            <p className="font-serif text-2xl leading-tight">{eventName}</p>
          ) : (
            <p className="leading-relaxed">{t("confirm.linkOnce")}</p>
          )}
          <ConfirmButton requestId={requestId} tokenHash={tokenHash} next={safeNextPath(params.next)} />
        </Sheet>
        <Sheet id="confirm-why-title" title={t("confirm.sheet.why")}>
          <p className="leading-relaxed">{t("confirm.why")}</p>
        </Sheet>
      </div>
    </AuthPage>
  );
}

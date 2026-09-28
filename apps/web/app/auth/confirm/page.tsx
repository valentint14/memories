import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmButton } from "@/components/self-service/ConfirmButton";
import { NarrowPage } from "@/components/ui/NarrowPage";
import { t } from "@/lib/i18n";
import { safeNextPath } from "@/lib/security/redirect";
import { adminSupabase } from "@/lib/supabase/admin";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Confirmare" };

/**
 * Pagina deschisă din linkul din email (002: FR-007; research R2). Deschiderea nu consumă tokenul:
 * scanerele de email văd doar pagina; confirmarea cere apăsarea butonului.
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

  return (
    <NarrowPage title={purpose === "create" ? t("confirm.createTitle") : t("confirm.loginTitle")}>
      {usable ? (
        <>
          {purpose === "create" && eventName !== null ? (
            <div className="flex flex-col gap-2 border-y border-rule py-4">
              <p className="text-ink-muted">{t("confirm.createIntro")}</p>
              <p className={ui.sectionTitle}>{eventName}</p>
            </div>
          ) : (
            <p className="leading-relaxed">{t("confirm.loginIntro")}</p>
          )}
          <ConfirmButton requestId={requestId} tokenHash={tokenHash} next={safeNextPath(params.next)} />
        </>
      ) : (
        <div className="flex flex-col gap-4">
          <p role="alert" className={ui.alert}>
            {t("confirm.invalid")}
          </p>
          <Link href="/login" className={ui.link}>
            {t("confirm.newRequest")}
          </Link>
        </div>
      )}
    </NarrowPage>
  );
}

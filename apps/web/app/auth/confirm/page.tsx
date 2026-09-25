import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmButton } from "@/components/self-service/ConfirmButton";
import { t } from "@/lib/i18n";
import { safeNextPath } from "@/lib/security/redirect";
import { adminSupabase } from "@/lib/supabase/admin";

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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">{purpose === "create" ? t("confirm.createTitle") : t("confirm.loginTitle")}</h1>
      {usable ? (
        <>
          {purpose === "create" && eventName !== null ? (
            <div className="flex flex-col gap-1">
              <p>{t("confirm.createIntro")}</p>
              <p className="text-xl font-semibold">{eventName}</p>
            </div>
          ) : (
            <p>{t("confirm.loginIntro")}</p>
          )}
          <ConfirmButton requestId={requestId} tokenHash={tokenHash} next={safeNextPath(params.next)} />
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <p role="alert" className="rounded-lg border border-danger p-3 text-danger">
            {t("confirm.invalid")}
          </p>
          <Link href="/login" className="font-semibold text-brand-700 underline">
            {t("confirm.newRequest")}
          </Link>
        </div>
      )}
    </main>
  );
}

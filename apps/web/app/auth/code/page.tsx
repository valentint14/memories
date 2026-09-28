import type { Metadata } from "next";
import { CodeForm } from "@/components/self-service/CodeForm";
import { NarrowPage } from "@/components/ui/NarrowPage";
import { t } from "@/lib/i18n";
import { safeNextPath } from "@/lib/security/redirect";
import { ui } from "@/lib/ui";

export const metadata: Metadata = { title: "Verifică-ți emailul" };

/**
 * Pagina de după trimiterea formularului (002: FR-003, FR-008). Arată la fel pentru orice adresă
 * și pentru orice cerere (inclusiv limitată): emailul nu apare în URL și nu se afișează.
 */
export default async function CodePage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string; next?: string; resent?: string }>;
}) {
  const params = await searchParams;
  const requestId = /^[0-9a-f-]{36}$/i.test(params.request ?? "") ? (params.request ?? "") : "";
  return (
    <NarrowPage title={t("code.title")}>
      <p role="status" className={ui.notice}>
        {params.resent === "1" ? t("code.resent") : t("code.intro")}
      </p>
      <p className="leading-relaxed text-ink-muted">{t("code.otherDevice")}</p>
      <CodeForm requestId={requestId} next={safeNextPath(params.next)} />
    </NarrowPage>
  );
}

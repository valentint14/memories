import type { Metadata } from "next";
import { CodeForm } from "@/components/self-service/CodeForm";
import { t } from "@/lib/i18n";
import { safeNextPath } from "@/lib/security/redirect";

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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">{t("code.title")}</h1>
      <p role="status" className="rounded-lg bg-brand-50 p-4 text-ink">
        {params.resent === "1" ? t("code.resent") : t("code.intro")}
      </p>
      <p className="text-muted">{t("code.otherDevice")}</p>
      <CodeForm requestId={requestId} next={safeNextPath(params.next)} />
    </main>
  );
}

import Link from "next/link";
import { connection } from "next/server";
import { formatDate, t } from "@/lib/i18n";
import { currentLegalVersions, legalText, type LegalKind } from "@/lib/legal";
import { renderMarkdown } from "@/lib/markdown";

/** Versiunea în vigoare a unui document legal, cu versiunea și data (002: FR-039). */
export async function LegalPage({ kind }: { kind: LegalKind }) {
  // Randare per cerere, pentru nonce-ul CSP; versiunea curentă se poate schimba fără build nou.
  await connection();
  const versions = await currentLegalVersions();
  const version = versions[kind];
  const source = await legalText(kind, version);
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6 leading-relaxed">
      {renderMarkdown(source)}
      <p className="mt-6 text-sm text-muted">{t("legal.version", { date: formatDate(versions.effectiveAt[kind]) })}</p>
      <Link href="/" className="font-semibold text-brand-700 underline">
        {t("legal.back")}
      </Link>
    </main>
  );
}

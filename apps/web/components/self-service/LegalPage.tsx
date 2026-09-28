import Link from "next/link";
import { connection } from "next/server";
import { Wordmark } from "@/components/ui/Wordmark";
import { formatDate, t } from "@/lib/i18n";
import { currentLegalVersions, legalText, type LegalKind } from "@/lib/legal";
import { renderMarkdown } from "@/lib/markdown";
import { ui } from "@/lib/ui";

/** Versiunea în vigoare a unui document legal, cu versiunea și data (002: FR-039). */
export async function LegalPage({ kind }: { kind: LegalKind }) {
  // Randare per cerere, pentru nonce-ul CSP; versiunea curentă se poate schimba fără build nou.
  await connection();
  const versions = await currentLegalVersions();
  const version = versions[kind];
  const source = await legalText(kind, version);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10 px-4 py-6 sm:px-6">
      <Wordmark />
      <main className="flex flex-col gap-4 leading-relaxed">
        {renderMarkdown(source)}
        <p className={`${ui.kicker} mt-6 border-t border-rule pt-4 text-ink-muted`}>
          {t("legal.version", { date: formatDate(versions.effectiveAt[kind]) })}
        </p>
        <Link href="/" className={ui.link}>
          {t("legal.back")}
        </Link>
      </main>
    </div>
  );
}

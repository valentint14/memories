import Link from "next/link";
import { connection } from "next/server";
import { SiteHeader } from "@/components/nav/SiteHeader";
import { BusinessIdentity } from "@/components/ui/BusinessIdentity";
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
  // Titlul, apoi datele prestatorului, apoi textul.
  const [title, ...body] = renderMarkdown(source);
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader context="public" />
      <main id="continut" className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-10 leading-relaxed sm:px-6">
        {title}
        <BusinessIdentity />
        {body}
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

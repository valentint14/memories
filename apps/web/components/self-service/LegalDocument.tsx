import Link from "next/link";
import { SiteHeader } from "@/components/nav/SiteHeader";
import { BusinessIdentity } from "@/components/ui/BusinessIdentity";
import { t } from "@/lib/i18n";
import { renderMarkdown } from "@/lib/markdown";
import { markdownOutline } from "@/lib/markdown-outline";
import { ui } from "@/lib/ui";
import { LegalToc } from "./LegalToc";
import { PrintButton } from "./PrintButton";

/**
 * Aspectul unui document legal: titlul, versiunea cu butonul de tipărire, cuprinsul lipit în
 * stânga (pliat pe telefon), datele prestatorului și textul. Ce nu are rost pe hârtie se ascunde la
 * tipărire.
 */
export function LegalDocument({ source, effective }: { source: string; effective: string }) {
  // Titlul, apoi datele prestatorului, apoi textul.
  const [title, ...body] = renderMarkdown(source);
  return (
    <div className="flex flex-1 flex-col">
      <div className="print:hidden">
        <SiteHeader context="public" />
      </div>
      <main id="continut" className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 leading-relaxed sm:px-6">
        <header className="flex flex-col gap-4">
          {title}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={`${ui.kicker} text-ink-muted`}>{effective}</p>
            <div className="print:hidden">
              <PrintButton />
            </div>
          </div>
        </header>
        <div className="grid items-start gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <LegalToc outline={markdownOutline(source)} />
          <div className="flex max-w-2xl flex-col gap-4">
            <BusinessIdentity />
            {body}
            <p className={`${ui.kicker} mt-6 border-t border-rule pt-4 text-ink-muted`}>{effective}</p>
            <Link href="/" className={`${ui.link} print:hidden`}>
              {t("legal.back")}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

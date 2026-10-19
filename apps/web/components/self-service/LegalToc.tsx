import { t } from "@/lib/i18n";
import type { OutlineEntry } from "@/lib/markdown-outline";
import { ui } from "@/lib/ui";

const entryLink = "flex min-h-11 items-center text-ink-muted hover:text-ink hover:underline lg:min-h-8";

function TocList({ outline }: { outline: OutlineEntry[] }) {
  return (
    <ol className="flex flex-col">
      {outline.map((entry) => (
        <li key={entry.id} className={entry.level === 3 ? "pl-4 text-sm" : "font-medium"}>
          <a href={`#${entry.id}`} className={entry.level === 3 ? entryLink : `${entryLink} text-ink`}>
            {entry.text}
          </a>
        </li>
      ))}
    </ol>
  );
}

/**
 * Cuprinsul documentului legal. Pe ecran lat stă lipit în stânga, pe telefon e o foaie pliată sub
 * antet. Doar una dintre cele două variante e vizibilă (și în arborele de accesibilitate) odată.
 */
export function LegalToc({ outline }: { outline: OutlineEntry[] }) {
  return (
    <aside className="print:hidden lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto">
      <details className={`group ${ui.sheet} lg:hidden`}>
        <summary className={ui.sheetSummary}>{t("legal.toc")}</summary>
        <nav aria-label={t("legal.toc")} className="max-h-[60dvh] overflow-y-auto px-4 py-2">
          <TocList outline={outline} />
        </nav>
      </details>
      <nav aria-label={t("legal.toc")} className="hidden lg:block">
        <p className={`${ui.kicker} mb-2 text-ink-muted`}>{t("legal.toc")}</p>
        <TocList outline={outline} />
      </nav>
    </aside>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { headingId } from "./heading-id";
import { linkKind, markdownBlocks } from "./markdown-outline";
import { ui } from "./ui";

/**
 * Randare Markdown minimală pentru documentele legale din repository (titluri, paragrafe, liste,
 * citate, **îngroșat**, [linkuri](url)). Textul devine noduri React, deci nu se injectează niciodată HTML.
 */
const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
const LINK = /^\[([^\]]+)\]\(([^)]+)\)$/;

function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${String(i)}`;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={key}>{part.slice(2, -2)}</strong>;
    const link = LINK.exec(part);
    const label = link?.[1];
    const href = link?.[2];
    const kind = href === undefined ? null : linkKind(href);
    if (label === undefined || href === undefined || kind === null) return part;
    return kind === "internal" ? (
      <Link key={key} href={href} className={ui.link}>
        {label}
      </Link>
    ) : (
      <a key={key} href={href} className={ui.link} {...(href.startsWith("https://") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {label}
      </a>
    );
  });
}

export function renderMarkdown(source: string): ReactNode[] {
  return markdownBlocks(source).map((block, index) => {
    const key = `b${String(index)}`;
    const lines = block.split("\n");
    const first = lines[0] ?? "";
    if (first.startsWith("### ")) return <h3 key={key} id={headingId(first.slice(4))} className="mt-2 scroll-mt-24 font-serif text-xl leading-tight">{inline(first.slice(4), key)}</h3>;
    if (first.startsWith("## ")) return <h2 key={key} id={headingId(first.slice(3))} className="mt-6 scroll-mt-24 font-serif text-2xl leading-tight">{inline(first.slice(3), key)}</h2>;
    if (first.startsWith("# ")) return <h1 key={key} className="font-serif text-4xl leading-[1.05] tracking-tight sm:text-5xl">{inline(first.slice(2), key)}</h1>;
    if (lines.every((l) => l.startsWith("> "))) {
      return (
        <blockquote key={key} className="rounded-xs border border-rule bg-paper-raised p-4">
          {inline(lines.map((l) => l.slice(2)).join(" "), key)}
        </blockquote>
      );
    }
    if (lines.every((l) => /^(- |\s{2,}\S)/.test(l))) {
      const items: string[] = [];
      for (const line of lines) {
        if (line.startsWith("- ")) items.push(line.slice(2));
        else items[items.length - 1] = `${items[items.length - 1] ?? ""} ${line.trim()}`;
      }
      return (
        <ul key={key} className="list-disc pl-6">
          {items.map((item, i) => (
            <li key={`${key}-${String(i)}`}>{inline(item, `${key}-${String(i)}`)}</li>
          ))}
        </ul>
      );
    }
    return <p key={key}>{inline(lines.join(" "), key)}</p>;
  });
}

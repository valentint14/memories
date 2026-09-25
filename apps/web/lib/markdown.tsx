import type { ReactNode } from "react";

/**
 * Randare Markdown minimală pentru documentele legale din repository (titluri, paragrafe, liste,
 * citate, **îngroșat**). Textul devine noduri React, deci nu se injectează niciodată HTML.
 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={`${keyPrefix}-${String(i)}`}>{part.slice(2, -2)}</strong> : part,
  );
}

export function renderMarkdown(source: string): ReactNode[] {
  const blocks = source.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  return blocks.map((block, index) => {
    const key = `b${String(index)}`;
    const lines = block.split("\n");
    const first = lines[0] ?? "";
    if (first.startsWith("## ")) return <h2 key={key} className="mt-4 text-xl font-semibold">{inline(first.slice(3), key)}</h2>;
    if (first.startsWith("# ")) return <h1 key={key} className="text-2xl font-bold">{inline(first.slice(2), key)}</h1>;
    if (lines.every((l) => l.startsWith("> "))) {
      return (
        <blockquote key={key} className="rounded-lg border-l-4 border-brand-600 bg-brand-50 p-3">
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

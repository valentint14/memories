import { headingId } from "./heading-id";

export interface OutlineEntry {
  id: string;
  /** Titlul cu tot cu număr („6.4 Cum ceri o rambursare”). */
  text: string;
  level: 2 | 3;
}

/** Blocurile unui document Markdown, separate prin rânduri goale. */
export function markdownBlocks(source: string): string[] {
  return source.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
}

/** Titlurile secțiunilor (`##`) și ale subsecțiunilor (`###`), în ordine, pentru cuprins. */
export function markdownOutline(source: string): OutlineEntry[] {
  const outline: OutlineEntry[] = [];
  for (const block of markdownBlocks(source)) {
    const first = block.split("\n")[0] ?? "";
    if (first.startsWith("### ")) outline.push({ id: headingId(first.slice(4)), text: first.slice(4), level: 3 });
    else if (first.startsWith("## ")) outline.push({ id: headingId(first.slice(3)), text: first.slice(3), level: 2 });
  }
  return outline;
}

/** Doar linkuri https, mailto și căi din aplicație; orice altceva (javascript:, data:, //host) nu e link. */
export function linkKind(href: string): "internal" | "external" | null {
  if (href.startsWith("/") && !href.startsWith("//")) return "internal";
  if (/^(https:\/\/|mailto:)/.test(href)) return "external";
  return null;
}

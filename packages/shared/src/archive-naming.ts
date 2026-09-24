/**
 * Numele fișierelor din arhivă și ale descărcărilor individuale (research.md R9):
 * `AAAA-LL-ZZ_HH-MM-SS_{nume-invitat|anonim}_{id-scurt}.{ext}`, ora în Europe/Bucharest.
 */
import { APP_TIME_ZONE } from "./limits.ts";

const stampFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function localStamp(iso: string): string {
  const p: Record<string, string> = {};
  for (const part of stampFormat.formatToParts(new Date(iso))) p[part.type] = part.value;
  return `${p.year ?? ""}-${p.month ?? ""}-${p.day ?? ""}_${p.hour ?? ""}-${p.minute ?? ""}-${p.second ?? ""}`;
}

const MAX_NAME = 40;

/** Diacritice și emoji păstrate; fără separatori de cale, caractere de control sau rezervate. */
export function safeNamePart(value: string | null): string {
  if (value === null) return "anonim";
  const cleaned = value
    // eslint-disable-next-line no-control-regex -- eliminăm intenționat caracterele de control
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\.{2,}/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  const chars = Array.from(cleaned).slice(0, MAX_NAME).join("");
  return chars === "" ? "anonim" : chars;
}

export function archiveEntryName(item: { uploadedAt: string; guestName: string | null; id: string; extension: string }): string {
  return `${localStamp(item.uploadedAt)}_${safeNamePart(item.guestName)}_${item.id.slice(0, 8)}.${item.extension}`;
}

/** Garantează unicitatea numelor (sufix `-2`, `-3`…). */
export function uniqueEntryNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    if (count === 1) return name;
    const dot = name.lastIndexOf(".");
    return dot > 0 ? `${name.slice(0, dot)}-${String(count)}${name.slice(dot)}` : `${name}-${String(count)}`;
  });
}

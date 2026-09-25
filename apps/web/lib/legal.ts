import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { adminSupabase } from "./supabase/admin";

export type LegalKind = "terms" | "privacy";

export interface LegalVersions {
  terms: string;
  privacy: string;
}

/** Versiunile în vigoare ale documentelor legale (002: FR-039, FR-041; research R9). */
export async function currentLegalVersions(): Promise<LegalVersions & { effectiveAt: Record<LegalKind, string> }> {
  const { data, error } = await adminSupabase().rpc("current_legal_versions");
  if (error) throw new Error(error.message);
  const byKind = new Map(data.map((row) => [row.kind, row]));
  const terms = byKind.get("terms");
  const privacy = byKind.get("privacy");
  if (!terms || !privacy) throw new Error("Lipsesc versiunile documentelor legale");
  return {
    terms: terms.version,
    privacy: privacy.version,
    effectiveAt: { terms: terms.effective_at, privacy: privacy.effective_at },
  };
}

/** Textul Markdown al unei versiuni, din `apps/web/content/legal/{kind}/{version}.md`. */
export async function legalText(kind: LegalKind, version: string): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(version)) throw new Error("Versiune invalidă");
  return readFile(join(process.cwd(), "content", "legal", kind, `${version}.md`), "utf8");
}

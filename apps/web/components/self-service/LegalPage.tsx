import { connection } from "next/server";
import { formatDate, t } from "@/lib/i18n";
import { currentLegalVersions, legalText, type LegalKind } from "@/lib/legal";
import { LegalDocument } from "./LegalDocument";

/** Versiunea în vigoare a unui document legal, cu versiunea și data (002: FR-039). */
export async function LegalPage({ kind }: { kind: LegalKind }) {
  // Randare per cerere, pentru nonce-ul CSP; versiunea curentă se poate schimba fără build nou.
  await connection();
  const versions = await currentLegalVersions();
  const source = await legalText(kind, versions[kind]);
  return <LegalDocument source={source} effective={t("legal.version", { date: formatDate(versions.effectiveAt[kind]) })} />;
}

import Link from "next/link";
import { connection } from "next/server";
import { businessDetails } from "@/lib/business";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

const link = `${ui.link} inline-flex min-h-11 items-center`;

/**
 * Subsolul tuturor paginilor: documentele legale, contactul și datele prestatorului. Datele vin din
 * variabile de mediu citite la fiecare cerere (nu la build, când secretele serverului lipsesc).
 */
export async function SiteFooter() {
  await connection();
  const b = businessDetails();
  const identity = [
    b.name,
    b.taxId === null ? null : `${t("business.taxId")} ${b.taxId}`,
    b.registrationNo === null ? null : `${t("business.registrationNo")} ${b.registrationNo}`,
    b.address,
    b.phone,
  ].filter((part): part is string => part !== null);

  return (
    <footer aria-label={t("footer.label")} className="mt-auto border-t border-rule bg-paper print:hidden">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-ink-muted sm:px-8">
        <nav aria-label={t("footer.label")} className="flex flex-wrap gap-x-6">
          <Link href="/terms" className={link}>
            {t("footer.terms")}
          </Link>
          <Link href="/privacy" className={link}>
            {t("footer.privacy")}
          </Link>
          <Link href="/terms#retragere-si-rambursari" className={link}>
            {t("footer.withdrawal")}
          </Link>
          {b.email !== null && (
            <a href={`mailto:${b.email}`} className={link}>
              {t("footer.contact")}: {b.email}
            </a>
          )}
        </nav>
        {identity.length > 0 && <p className="leading-relaxed">{identity.join(" · ")}</p>}
      </div>
    </footer>
  );
}

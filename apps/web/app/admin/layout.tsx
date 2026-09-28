import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/ui/Wordmark";
import { adminAccess } from "@/lib/admin/guard";
import { t } from "@/lib/i18n";
import { ui } from "@/lib/ui";

/** Zona de administrare: doar administratori cu al doilea factor validat (FR-006, FR-006a). */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const access = await adminAccess();
  if (access === "anonymous") redirect("/login?next=/admin/events");
  if (access === "not-admin") notFound();
  if (access === "needs-mfa") redirect("/auth/mfa");

  return (
    <div className="min-h-dvh">
      <header className="border-b border-rule">
        <nav aria-label={t("admin.nav")} className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 sm:px-8">
          <span className="flex items-baseline gap-3">
            <Wordmark href="/admin/events" />
            <span className={`${ui.kicker} text-accent`}>{t("admin.title")}</span>
          </span>
          <Link href="/admin/events" className={ui.link}>
            {t("admin.events")}
          </Link>
          <Link href="/admin/retention" className={ui.link}>
            {t("admin.retention")}
          </Link>
          <Link href="/admin/package" className={ui.link}>
            {t("admin.package.nav")}
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}

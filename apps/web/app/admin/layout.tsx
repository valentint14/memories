import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { adminAccess } from "@/lib/admin/guard";
import { t } from "@/lib/i18n";

/** Zona de administrare: doar administratori cu al doilea factor validat (FR-006, FR-006a). */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const access = await adminAccess();
  if (access === "anonymous") redirect("/login?next=/admin/events");
  if (access === "not-admin") notFound();
  if (access === "needs-mfa") redirect("/auth/mfa");

  return (
    <div className="min-h-dvh">
      <header className="border-b border-gray-200 bg-white">
        <nav aria-label={t("admin.nav")} className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 p-4">
          <Link href="/admin/events" className="font-bold text-brand-700">
            {t("admin.title")}
          </Link>
          <Link href="/admin/events" className="underline-offset-4 hover:underline">
            {t("admin.events")}
          </Link>
          <Link href="/admin/retention" className="underline-offset-4 hover:underline">
            {t("admin.retention")}
          </Link>
          <Link href="/admin/package" className="underline-offset-4 hover:underline">
            {t("admin.package.nav")}
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-4 sm:p-6">{children}</main>
    </div>
  );
}

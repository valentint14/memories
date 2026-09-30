import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/nav/SiteHeader";
import { adminAccess } from "@/lib/admin/guard";

/** Zona de administrare: doar administratori cu al doilea factor validat (FR-006, FR-006a). */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const access = await adminAccess();
  if (access === "anonymous") redirect("/login?next=/admin/events");
  if (access === "not-admin") notFound();
  if (access === "needs-mfa") redirect("/auth/mfa");

  return (
    <div className="min-h-dvh">
      <SiteHeader context="admin" />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-10">{children}</main>
    </div>
  );
}

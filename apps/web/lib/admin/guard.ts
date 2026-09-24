import "server-only";
import { notFound, redirect } from "next/navigation";
import { ActionError } from "../actions/result";
import { serverSupabase } from "../supabase/server";
import type { TypedClient } from "../supabase/types";

/** Client al administratorului, doar cu al doilea factor validat (aal2) — FR-006a. */
export async function requireAdmin(): Promise<TypedClient> {
  const supabase = await serverSupabase();
  const { data } = await supabase.rpc("is_admin");
  if (data !== true) throw new ActionError("FORBIDDEN");
  return supabase;
}

/**
 * Varianta pentru paginile de administrare: în loc să arunce o eroare (care ar apărea ca
 * eroare de randare), redirecționează ca layout-ul — layout-ul și pagina se randează în paralel.
 */
export async function requireAdminPage(): Promise<TypedClient> {
  const access = await adminAccess();
  if (access === "anonymous") redirect("/login?next=/admin/events");
  if (access === "not-admin") notFound();
  if (access === "needs-mfa") redirect("/auth/mfa");
  return serverSupabase();
}

export type AdminAccess = "anonymous" | "not-admin" | "needs-mfa" | "admin";

export async function adminAccess(): Promise<AdminAccess> {
  const supabase = await serverSupabase();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return "anonymous";
  const { data: isAdminUser } = await supabase.rpc("is_platform_admin_user");
  if (isAdminUser !== true) return "not-admin";
  const { data: isAdmin } = await supabase.rpc("is_admin");
  return isAdmin === true ? "admin" : "needs-mfa";
}

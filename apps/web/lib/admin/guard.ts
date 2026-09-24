import "server-only";
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

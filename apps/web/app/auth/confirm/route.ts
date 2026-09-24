import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/security/redirect";

/** Schimbă tokenul din emailul de autentificare pe o sesiune, apoi redirecționează (FR-008). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const loginWithError = NextResponse.redirect(new URL("/login?error=link", url.origin));
  if (!tokenHash) return loginWithError;

  const supabase = await serverSupabase();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error) return loginWithError;

  const next = safeNextPath(url.searchParams.get("next"));
  if (next) return NextResponse.redirect(new URL(next, url.origin));

  const { data: isAdminUser } = await supabase.rpc("is_platform_admin_user");
  return NextResponse.redirect(new URL(isAdminUser === true ? "/admin/events" : "/events", url.origin));
}

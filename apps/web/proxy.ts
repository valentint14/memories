import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "./lib/security/csp";

/**
 * Reîmprospătează sesiunea Supabase și aplică headerele de securitate cu nonce CSP per cerere
 * (contracts/web-interface.md › Headere de securitate).
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const csp = buildCsp({ nonce, supabaseUrl, isDev: process.env.NODE_ENV === "development" });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });
  // Paginile invitaților nu au sesiune Supabase; nu apelăm Auth acolo (LCP).
  if (!request.nextUrl.pathname.startsWith("/e/")) {
    await supabase.auth.getUser();
  }

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  const path = request.nextUrl.pathname;
  // Paginile de confirmare au tokenuri în URL (002, research R2): fără referrer și fără cache.
  const hasTokenInUrl = path === "/auth/confirm" || path === "/auth/code";
  response.headers.set(
    "Referrer-Policy",
    path.startsWith("/e/") || hasTokenInUrl ? "no-referrer" : "strict-origin-when-cross-origin",
  );
  if (hasTokenInUrl) response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

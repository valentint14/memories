import type { CookieOptions } from "@supabase/ssr";

/**
 * Opțiunile cookie-urilor de sesiune Supabase, cu `Secure` când aplicația e servită pe HTTPS
 * (aceeași regulă ca la cookie-ul invitatului, `lib/actions/guest.ts`). Local și în CI aplicația
 * rulează pe HTTP, unde un cookie `Secure` n-ar mai fi trimis. `httpOnly` rămâne neschimbat:
 * clientul din browser citește sesiunea din cookie pentru galeria în timp real.
 */
export function sessionCookieOptions(options: CookieOptions, appUrl: string | undefined = process.env.APP_URL): CookieOptions {
  return appUrl?.startsWith("https://") ? { ...options, secure: true } : options;
}

/** Originea scripturilor și a iframe-ului Cloudflare Turnstile (research R3). */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/**
 * Politica CSP cu nonce per cerere. `strict-dynamic` lasă scriptul Turnstile (încărcat cu nonce)
 * să-și încarce singur resursele; originea rămâne listată pentru browserele fără CSP3.
 */
export function buildCsp(options: { nonce: string; supabaseUrl: string; isDev: boolean }): string {
  const { nonce, supabaseUrl, isDev } = options;
  const supabaseWs = supabaseUrl.replace(/^http/, "ws");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${TURNSTILE_ORIGIN}${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${supabaseUrl}`,
    `media-src 'self' blob: ${supabaseUrl}`,
    `connect-src 'self' ${supabaseUrl} ${supabaseWs}`,
    `frame-src ${TURNSTILE_ORIGIN}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Local, Supabase rulează pe HTTP: upgrade-ul ar strica uploadurile.
    ...(supabaseUrl.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

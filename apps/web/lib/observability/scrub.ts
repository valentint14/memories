/**
 * Elimină datele personale din evenimentele trimise la Sentry (research.md R14):
 * emailuri, tokenuri de eveniment din URL-uri, căi de fișiere și nume de invitați.
 */

const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g;
const EVENT_TOKEN_PATH = /\/e\/[A-Za-z0-9_-]{16,}/g;
const STORAGE_PATH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[^\s"']+/gi;
const SENSITIVE_KEYS = new Set([
  "email",
  "organizer_email",
  "organizerEmail",
  "display_name",
  "displayName",
  "guest_name",
  "guestName",
  "original_filename",
  "originalFilename",
  "name",
  "token",
  "public_token",
  "signedToken",
]);

export function scrubString(value: string): string {
  return value
    .replace(EMAIL, "[email]")
    .replace(EVENT_TOKEN_PATH, "/e/[token]")
    .replace(STORAGE_PATH, "[path]");
}

export function scrub<T>(value: T, depth = 0): T {
  if (depth > 8) return value;
  if (typeof value === "string") return scrubString(value) as T;
  if (Array.isArray(value)) return value.map((v: unknown) => scrub(v, depth + 1)) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = SENSITIVE_KEYS.has(key) ? "[redacted]" : scrub(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

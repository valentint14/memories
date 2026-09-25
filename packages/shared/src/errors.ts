/** Coduri de eroare stabile (contracts/web-interface.md), verificate de teste. */

export const ERROR_CODES = [
  "EVENT_NOT_FOUND",
  "UPLOAD_NOT_STARTED",
  "UPLOAD_ENDED",
  "FILE_LIMIT_REACHED",
  "FILE_TOO_LARGE",
  "FILE_TYPE_NOT_ALLOWED",
  "RATE_LIMITED",
  "SESSION_MISSING",
  "NAME_TOO_LONG",
  "FORBIDDEN",
  "NOT_READY",
  "ARCHIVE_EXPIRED",
  "EMPTY_EVENT",
  "VALIDATION",
  "NOT_FOUND",
  "CONFIRMATION_MISMATCH",
  "INVALID_CODE",
  "RETENTION_NOT_LONGER",
  "RETENTION_EXPIRED",
  "PRICE_CHANGED",
  "OPTION_INACTIVE",
  "OPTION_IN_USE",
  "DUPLICATE_MONTHS",
  "RETENTION_DATE_IN_PAST",
  "EVENT_NOT_ACTIVE",
  "EVENT_EXPIRED",
  "EVENT_NOT_ACTIVATED",
  "EVENT_SUSPENDED",
  "AWAITING_LIMIT_REACHED",
  "TERMS_OUTDATED",
  "CAPTCHA_FAILED",
  "REQUEST_EXPIRED",
  "REQUEST_INVALIDATED",
  "ACTIVATION_REQUEST_TOO_SOON",
  "INVALID_TRANSITION",
  "REASON_REQUIRED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

/** Forma minimă a unei erori PostgREST / pg. */
export interface DbErrorLike {
  code?: string | undefined;
  message?: string | undefined;
  details?: string | null | undefined;
  detail?: string | null | undefined;
}

export interface MappedError {
  code: ErrorCode;
  detail: Record<string, unknown>;
}

/**
 * Mapează o eroare din baza de date la un cod stabil. Funcțiile SQL ridică `P0001` cu mesajul
 * egal cu codul (vezi `raise_app_error`); unele constrângeri sunt traduse aici.
 */
export function mapDbError(error: DbErrorLike): MappedError {
  const message = error.message ?? "";
  const rawDetail = error.details ?? error.detail ?? "";
  let detail: Record<string, unknown> = {};
  if (rawDetail !== "") {
    try {
      const parsed: unknown = JSON.parse(rawDetail);
      if (parsed !== null && typeof parsed === "object") detail = parsed as Record<string, unknown>;
    } catch {
      detail = {};
    }
  }
  if (isErrorCode(message)) return { code: message, detail };
  // 23503: foreign key — o opțiune de retenție folosită de un eveniment nu poate fi ștearsă.
  if (error.code === "23503" && message.includes("retention_option")) return { code: "OPTION_IN_USE", detail };
  // 23505: unique — două opțiuni cu aceeași durată.
  if (error.code === "23505" && message.includes("retention_options_months")) return { code: "DUPLICATE_MONTHS", detail };
  if (error.code === "23514" || error.code === "22P02") return { code: "VALIDATION", detail };
  if (error.code === "42501") return { code: "FORBIDDEN", detail };
  return { code: "INTERNAL", detail };
}

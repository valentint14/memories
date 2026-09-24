import pino from "pino";

/**
 * Loguri JSON (contracts/worker-jobs.md › Loguri). Interzise: nume de invitați, emailuri,
 * tokenuri, nume de fișiere originale — redactate dacă ajung accidental în context.
 */
export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "worker" },
  redact: {
    paths: [
      "email",
      "*.email",
      "organizer_email",
      "*.organizer_email",
      "guest_name",
      "*.guest_name",
      "display_name",
      "original_filename",
      "*.original_filename",
      "public_token",
      "token",
    ],
    censor: "[redacted]",
  },
});

export type JobLogFields = {
  job: string;
  media_id?: string;
  archive_job_id?: string;
  event_id?: string;
  user_id?: string;
  threshold?: string;
  attempt?: number;
  duration_ms?: number;
  result?: "ok" | "skipped" | "retry" | "failed";
  error_code?: string;
};

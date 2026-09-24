import * as Sentry from "@sentry/node";
import { config } from "./config.ts";

/** Sentry în regiunea UE, fără date personale (research.md R14). */
export function initSentry(): void {
  if (!config.sentryDsn) return;
  Sentry.init({
    dsn: config.sentryDsn,
    // Sentry 11: `dataCollection` înlocuiește `sendDefaultPii`; implicit colectează prea mult.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    tracesSampleRate: 0,
    beforeSend(event) {
      delete event.user;
      if (event.request) delete event.request.data;
      return event;
    },
  });
}

export function captureError(error: unknown, tags: Record<string, string>): void {
  if (!config.sentryDsn) return;
  Sentry.captureException(error, { tags });
}

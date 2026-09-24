import * as Sentry from "@sentry/nextjs";
import { scrub } from "./lib/observability/scrub";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Sentry 11: `dataCollection` înlocuiește `sendDefaultPii`; implicit colectează prea mult.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    tracesSampleRate: 0.1,
    beforeSend: (event) => scrub(event),
    beforeBreadcrumb: (breadcrumb) => scrub(breadcrumb),
  });
}

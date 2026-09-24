import * as Sentry from "@sentry/nextjs";
import { scrub } from "./lib/observability/scrub";

// DSN-ul client e public prin natura lui; lipsa lui dezactivează raportarea.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    tracesSampleRate: 0,
    beforeSend: (event) => scrub(event),
    beforeBreadcrumb: (breadcrumb) => scrub(breadcrumb),
  });
}

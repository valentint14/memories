import { APP_TIME_ZONE, EVENT_NAME_MAX, normalizeEmail } from "@memories/shared";
import { z } from "zod";

/** Ziua curentă în ora României, ca `AAAA-LL-ZZ`. */
export function todayInAppZone(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function addYears(isoDate: string, years: number): string {
  const [y = "0", m = "01", d = "01"] = isoDate.split("-");
  return `${String(Number(y) + years)}-${m}-${d}`;
}

/** Numele și data evenimentului (FR-002): nume 1–120, dată între azi și +2 ani (ora României). */
export function eventBasicsSchema(now: Date) {
  const today = todayInAppZone(now);
  const max = addYears(today, 2);
  return z.object({
    name: z.string().trim().min(1, "validation.required").max(EVENT_NAME_MAX, "validation.nameTooLong"),
    eventDate: z
      .string()
      .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= today && value <= max, "validation.dateRange"),
  });
}

/** Formularul de creare de pe pagina principală (002: FR-001, FR-002). */
export function createSelfServiceSchema(now: Date = new Date()) {
  return eventBasicsSchema(now)
    .extend({
      email: z.string().transform(normalizeEmail).pipe(z.email("validation.email").max(254, "validation.email")),
      termsVersion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      privacyVersion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      accepted: z.literal("on", "validation.acceptTerms"),
    })
    .transform(({ accepted: _accepted, ...rest }) => rest);
}

export type SelfServiceInput = z.output<ReturnType<typeof createSelfServiceSchema>>;

/** Câmpul-capcană `website` e ascuns oamenilor; completat, înseamnă un bot (research R3). */
export function isHoneypotFilled(value: FormDataEntryValue | null): boolean {
  return typeof value === "string" && value !== "";
}

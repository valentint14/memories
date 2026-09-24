import { config } from "../config.ts";
import { query } from "../db.ts";
import { loginEmail } from "../email/templates/autentificare.ts";
import { confirmationEmail } from "../email/templates/confirmare.ts";
import { sendMail } from "../email/transport.ts";
import { log } from "../log.ts";
import { supabase } from "../storage/client.ts";
import type { JobHandler } from "./types.ts";

type AuthEmailMessage = { type: "auth_email"; request_id: string; email: string; purpose: "create" | "login" };

/** Id-ul utilizatorului Auth pentru adresă, dacă există. */
export async function authUserId(email: string): Promise<string | null> {
  const [row] = await query<{ id: string }>("select id from auth.users where lower(email) = lower($1)", [email]);
  return row?.id ?? null;
}

/**
 * Emite codul și linkul prin API-ul administrativ Auth și trimite emailul (002: FR-006, FR-011,
 * FR-013; research R1). Pentru autentificare, o adresă fără cont nu primește nimic și nu se creează
 * utilizator; diferența nu se vede în răspunsul aplicației, pentru că jobul rulează după el.
 */
export const authEmail: JobHandler<AuthEmailMessage> = {
  async run({ request_id: requestId, email, purpose }) {
    const [request] = await query<{ event_name: string | null }>(
      `select e.name as event_name
         from public.auth_requests a
         left join public.events e on e.id = a.event_id
        where a.id = $1 and a.status = 'pending' and a.expires_at > now()`,
      [requestId],
    );
    // Cerere înlocuită, folosită sau expirată între timp.
    if (!request) {
      log.info({ job: "auth_email", request_id: requestId, result: "stale" }, "cerere inactivă");
      return;
    }

    const existing = await authUserId(email);
    if (existing === null) {
      if (purpose === "login") {
        log.info({ job: "auth_email", request_id: requestId, result: "skipped" }, "fără email");
        return;
      }
      const created = await supabase().auth.admin.createUser({ email, email_confirm: false });
      if (created.error) throw created.error;
    }

    // Un token nou îl invalidează pe cel anterior; la reîncercare, emailul trimis e mereu cel valid.
    const { data, error } = await supabase().auth.admin.generateLink({ type: "magiclink", email });
    if (error) throw error;
    const link = new URL("/auth/confirm", config.appUrl);
    link.searchParams.set("request", requestId);
    link.searchParams.set("token_hash", data.properties.hashed_token);

    const mail =
      purpose === "create"
        ? confirmationEmail({ eventName: request.event_name ?? "", code: data.properties.email_otp, link: link.toString() })
        : loginEmail({ code: data.properties.email_otp, link: link.toString() });
    await sendMail({ to: email, ...mail });
    log.info({ job: "auth_email", request_id: requestId, result: "sent" }, "email trimis");
  },
};

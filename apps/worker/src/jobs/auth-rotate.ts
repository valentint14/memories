import { query } from "../db.ts";
import { supabase } from "../storage/client.ts";
import { authUserId } from "./auth-email.ts";
import type { JobHandler } from "./types.ts";

/**
 * După 5 coduri greșite, codul se invalidează și la nivelul Auth, emițând unul nou care nu se
 * trimite (002: FR-008; research R4). Adresele fără cont sunt ignorate.
 */
export const authRotate: JobHandler<{ type: "auth_rotate"; email: string; request_id: string }> = {
  async run({ email, request_id: requestId }) {
    if ((await authUserId(email)) === null) return;
    // O cerere mai nouă și-a emis deja propriul cod (care l-a invalidat pe cel vechi); rotirea
    // l-ar invalida acum pe cel nou.
    const [newer] = await query<{ n: number }>(
      `select 1 as n from public.auth_requests a
        where a.email = $1
          and a.created_at > (select created_at from public.auth_requests where id = $2)`,
      [email, requestId],
    );
    if (newer) return;
    const { error } = await supabase().auth.admin.generateLink({ type: "magiclink", email });
    if (error) throw error;
  },
};

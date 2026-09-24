import { query } from "../db.ts";
import { supabase } from "../storage/client.ts";
import type { JobHandler } from "./types.ts";

/**
 * Șterge contul Auth al unui organizator fără evenimente (FR-047, contracts/worker-jobs.md).
 * Re-verifică înainte de ștergere: între timp adminul poate fi creat un eveniment pentru adresă.
 */
export const deleteOrganizerUser: JobHandler<{ type: "delete_organizer_user"; user_id: string }> = {
  async run({ user_id: userId }) {
    const { data, error } = await supabase().auth.admin.getUserById(userId);
    if (error?.status === 404 || !data.user) return;
    if (error) throw error;
    const email = data.user.email;
    if (email === undefined) return;

    const [orphan] = await query<{ id: string | null }>("select public.orphan_organizer_user_id($1) as id", [email]);
    if (orphan?.id !== userId) return;

    const deleted = await supabase().auth.admin.deleteUser(userId);
    if (deleted.error && deleted.error.status !== 404) throw deleted.error;
  },
};

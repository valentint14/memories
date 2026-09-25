import "server-only";
import { ActionError } from "../actions/result";
import { serverEnv } from "../server-env";
import { serverSupabase } from "../supabase/server";

/** Linkul de upload al evenimentului propriu (002/FR-009: organizatorul descarcă singur codul QR). */
export async function uploadUrlForOrganizer(eventId: string): Promise<string> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) throw new ActionError("NOT_FOUND");
  const supabase = await serverSupabase();
  const { data, error } = await supabase.rpc("organizer_event_token", { p_event_id: eventId });
  if (error || !data) throw new ActionError("NOT_FOUND");
  return new URL(`/e/${data}`, serverEnv.appUrl).toString();
}

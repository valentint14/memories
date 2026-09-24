"use client";

import type { TypedClient } from "../supabase/types";

/**
 * Realtime verifică RLS cu rolul din tokenul canalului. Clientul din browser își încarcă sesiunea
 * din cookies asincron; dacă abonarea pornește înainte, canalul rulează ca `anon` și filtrele pe
 * tabelele private sunt respinse. De aceea setăm explicit tokenul utilizatorului înainte de abonare.
 */
export async function authorizeRealtime(supabase: TypedClient): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session) await supabase.realtime.setAuth(data.session.access_token);
}

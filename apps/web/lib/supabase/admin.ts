import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "../env";
import { serverEnv } from "../server-env";
import type { Database, TypedClient } from "./types";

let client: TypedClient | undefined;

/**
 * Client service role — ocolește RLS. Folosit doar pe server pentru funcțiile invitaților,
 * tokenurile de upload semnate și crearea utilizatorilor organizator (plan › Complexity Tracking).
 */
export function adminSupabase(): TypedClient {
  client ??= createClient<Database>(publicEnv.supabaseUrl, serverEnv.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

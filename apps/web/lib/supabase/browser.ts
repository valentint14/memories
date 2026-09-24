import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "../env";
import type { Database, TypedClient } from "./types";

let client: TypedClient | undefined;

/** Client pentru componentele din browser (cheie anon; sesiunea din cookies). */
export function browserSupabase(): TypedClient {
  client ??= createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  return client;
}

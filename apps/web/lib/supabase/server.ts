import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "../env";
import type { Database, TypedClient } from "./types";

/** Client cu sesiunea utilizatorului curent (RLS se aplică). */
export async function serverSupabase(): Promise<TypedClient> {
  const cookieStore = await cookies();
  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Apel din Server Component: proxy.ts reîmprospătează sesiunea.
        }
      },
    },
  });
}

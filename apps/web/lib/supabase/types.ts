import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@memories/shared/db.types";

export type { Database };
/** Client tipat cu schema generată (`pnpm db:types`). */
export type TypedClient = SupabaseClient<Database>;

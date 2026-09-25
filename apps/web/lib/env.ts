/** Variabile de mediu publice (disponibile și în browser). */
function required(name: string, value: string | undefined): string {
  if (value === undefined || value === "") throw new Error(`Lipsește variabila de mediu ${name}`);
  return value;
}

export const publicEnv = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  turnstileSiteKey: required("NEXT_PUBLIC_TURNSTILE_SITE_KEY", process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
};

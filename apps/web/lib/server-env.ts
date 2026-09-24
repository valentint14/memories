import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`Lipsește variabila de mediu ${name}`);
  return value;
}

/** Secrete disponibile doar pe server (constituția, principiul III). */
export const serverEnv = {
  get serviceRoleKey(): string {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get appUrl(): string {
    return required("APP_URL");
  },
  get ipHashSecret(): string {
    return required("IP_HASH_SECRET");
  },
};

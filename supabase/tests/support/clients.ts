/**
 * Clienți Supabase pentru testele de bază de date: anon, organizatori, admin aal1/aal2, service role.
 * Fiecare fișier de test își creează propriii utilizatori (emailuri aleatoare), fără a atinge seed-ul.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient as BaseClient } from "@supabase/supabase-js";
import { TOTP } from "otpauth";
import pg from "pg";
import type { Database } from "../../../packages/shared/src/db.types.ts";

export type SupabaseClient = BaseClient<Database>;

interface LocalEnv {
  url: string;
  anonKey: string;
  serviceKey: string;
  dbUrl: string;
}

let cached: LocalEnv | undefined;

export function localEnv(): LocalEnv {
  if (cached) return cached;
  let url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let dbUrl = process.env.DATABASE_URL;
  if (!url || !anonKey || !serviceKey || !dbUrl) {
    const raw = execFileSync("npx", ["supabase", "status", "-o", "env"], {
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    const status = Object.fromEntries(
      raw
        .split(/\r?\n/)
        .map((l) => /^([A-Z0-9_]+)="?(.*?)"?$/.exec(l))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => [m[1], m[2]]),
    ) as Record<string, string | undefined>;
    url ??= status.API_URL;
    anonKey ??= status.ANON_KEY;
    serviceKey ??= status.SERVICE_ROLE_KEY;
    dbUrl ??= status.DB_URL;
  }
  if (!url || !anonKey || !serviceKey || !dbUrl) throw new Error("Supabase local nu rulează (pnpm db:start)");
  cached = { url, anonKey, serviceKey, dbUrl };
  return cached;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export function serviceClient(): SupabaseClient {
  const env = localEnv();
  return createClient<Database>(env.url, env.serviceKey, noSession);
}

export function anonClient(): SupabaseClient {
  const env = localEnv();
  return createClient<Database>(env.url, env.anonKey, noSession);
}

let pool: pg.Pool | undefined;

/** SQL direct ca `postgres` (pentru a simula trecerea timpului sau a verifica starea internă). */
export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  pool ??= new pg.Pool({ connectionString: localEnv().dbUrl, max: 2 });
  const res = await pool.query<T>(text, params);
  return res.rows;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

export function randomEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@example.test`;
}

export async function createUser(email: string): Promise<string> {
  const { data, error } = await serviceClient().auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

/** Client autentificat (aal1) prin magic link generat de admin API. */
export async function signedInClient(email: string): Promise<SupabaseClient> {
  const admin = serviceClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const client = anonClient();
  const verified = await client.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "email" });
  if (verified.error) throw verified.error;
  return client;
}

export async function organizerClient(email: string): Promise<SupabaseClient> {
  await createUser(email);
  return signedInClient(email);
}

/** Administrator: utilizator nou în platform_admins; cu `aal2: true` înrolează și verifică TOTP. */
export async function adminClient(opts: { aal2: boolean }): Promise<{ client: SupabaseClient; userId: string }> {
  const email = randomEmail("admin");
  const userId = await createUser(email);
  await sql("insert into public.platform_admins (user_id) values ($1)", [userId]);
  const client = await signedInClient(email);
  if (opts.aal2) {
    const enrolled = await client.auth.mfa.enroll({ factorType: "totp" });
    if (enrolled.error) throw enrolled.error;
    const totp = new TOTP({ secret: enrolled.data.totp.secret });
    const verified = await client.auth.mfa.challengeAndVerify({
      factorId: enrolled.data.id,
      code: totp.generate(),
    });
    if (verified.error) throw verified.error;
  }
  return { client, userId };
}

export interface TestEvent {
  id: string;
  public_token: string;
  purge_at: string;
  final_price_minor: number;
}

export async function retentionOptionId(months: number): Promise<string> {
  const rows = await sql<{ id: string }>("select id from public.retention_options where months = $1", [months]);
  const row = rows[0];
  if (!row) throw new Error(`Opțiunea de ${months} luni lipsește din seed`);
  return row.id;
}

/** Creează un eveniment direct în DB (ca `postgres`), cu fereastra de upload deschisă acum. */
export async function createTestEvent(overrides: {
  organizerEmail: string;
  name?: string;
  months?: number;
  basePriceMinor?: number;
  uploadStartsAt?: Date;
  uploadEndsAt?: Date;
  maxFilesPerGuest?: number;
  maxPhotoBytes?: number;
}): Promise<TestEvent> {
  const now = Date.now();
  // `pg` întoarce coloanele bigint ca text.
  const rows = await sql<Omit<TestEvent, "final_price_minor"> & { final_price_minor: string }>(
    `insert into public.events (
       name, event_date, organizer_email, upload_starts_at, upload_ends_at, base_price_minor,
       retention_option_id, max_files_per_guest, max_photo_bytes
     ) values ($1, current_date, $2, $3, $4, $5, $6, $7, $8)
     returning id, public_token, purge_at, final_price_minor`,
    [
      overrides.name ?? "Nuntă de test",
      overrides.organizerEmail,
      overrides.uploadStartsAt ?? new Date(now - 60 * 60 * 1000),
      overrides.uploadEndsAt ?? new Date(now + 24 * 60 * 60 * 1000),
      overrides.basePriceMinor ?? 29_900,
      await retentionOptionId(overrides.months ?? 3),
      overrides.maxFilesPerGuest ?? 50,
      overrides.maxPhotoBytes ?? 52_428_800,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("Evenimentul nu a fost creat");
  return { ...row, final_price_minor: Number(row.final_price_minor) };
}

/**
 * Simulează activarea unui eveniment `awaiting_activation` (câmpurile comerciale + tranziția),
 * pentru testele care nu testează activarea în sine (002; activarea reală: activate_event).
 */
export async function activateForTest(eventId: string): Promise<void> {
  await sql(
    `update public.events
        set upload_starts_at = now(),
            upload_ends_at = now() + interval '2 days',
            base_price_minor = 29900,
            retention_option_id = (select id from public.retention_options where months = 3),
            pending_purge_at = null,
            activated_at = now()
      where id = $1`,
    [eventId],
  );
  await sql("select public.transition_event($1, 'active', 'admin')", [eventId]);
}

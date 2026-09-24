/** Pregătirea datelor pentru e2e direct în Supabase local (service role), fără UI. */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@memories/shared/db.types";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Lipsește ${name} (rulează: node scripts/ci-env.mjs --write)`);
  return value;
}

let admin: SupabaseClient<Database> | undefined;

export function serviceClient(): SupabaseClient<Database> {
  admin ??= createClient<Database>(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

export function randomEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@example.test`;
}

/** Creează utilizatorul Auth al unui organizator și îi întoarce adresa. */
export async function createOrganizer(email = randomEmail("org")): Promise<string> {
  const { error } = await serviceClient().auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  return email;
}

export async function createAdmin(): Promise<string> {
  const email = randomEmail("admin");
  const { data, error } = await serviceClient().auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  const insert = await serviceClient().from("platform_admins").insert({ user_id: data.user.id });
  if (insert.error) throw insert.error;
  return email;
}

export interface SeededEvent {
  id: string;
  token: string;
}

export async function createEvent(opts: {
  organizerEmail: string;
  name?: string;
  months?: number;
  startsInMs?: number;
  endsInMs?: number;
  maxFilesPerGuest?: number;
  maxPhotoBytes?: number;
}): Promise<SeededEvent> {
  const client = serviceClient();
  const option = await client.from("retention_options").select("id").eq("months", opts.months ?? 3).single();
  if (option.error) throw option.error;
  const now = Date.now();
  const { data, error } = await client
    .from("events")
    .insert({
      name: opts.name ?? `Nuntă e2e ${randomUUID().slice(0, 4)}`,
      event_date: new Date().toISOString().slice(0, 10),
      organizer_email: opts.organizerEmail,
      upload_starts_at: new Date(now + (opts.startsInMs ?? -3_600_000)).toISOString(),
      upload_ends_at: new Date(now + (opts.endsInMs ?? 86_400_000)).toISOString(),
      base_price_minor: 29_900,
      retention_option_id: option.data.id,
      max_files_per_guest: opts.maxFilesPerGuest ?? 50,
      max_photo_bytes: opts.maxPhotoBytes ?? 52_428_800,
    })
    .select("id, public_token")
    .single();
  if (error) throw error;
  return { id: data.id, token: data.public_token };
}

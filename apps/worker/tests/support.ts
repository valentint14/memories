/** Utilitare comune pentru testele worker-ului pe Supabase local. */
import { randomUUID } from "node:crypto";
import { query } from "../src/db.ts";
import { supabase } from "../src/storage/client.ts";
import type { JobContext } from "../src/jobs/types.ts";

export function randomEmail(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@example.test`;
}

export async function createUser(email: string): Promise<string> {
  const { data, error } = await supabase().auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}

export async function userExists(userId: string): Promise<boolean> {
  const { data } = await supabase().auth.admin.getUserById(userId);
  return data.user !== null;
}

export async function createEvent(opts: {
  organizerEmail: string;
  months?: number;
  uploadEndsAt?: Date;
}): Promise<{ id: string; purge_at: Date }> {
  const end = opts.uploadEndsAt ?? new Date(Date.now() + 86_400_000);
  const rows = await query<{ id: string; purge_at: Date }>(
    `insert into public.events (name, event_date, organizer_email, upload_starts_at, upload_ends_at,
       base_price_minor, retention_option_id)
     values ('Eveniment worker', current_date, $1, $2, $3, 29900,
       (select id from public.retention_options where months = $4))
     returning id, purge_at`,
    [opts.organizerEmail, new Date(Math.min(Date.now(), end.getTime()) - 3_600_000), end, opts.months ?? 3],
  );
  const row = rows[0];
  if (!row) throw new Error("eveniment necreat");
  return row;
}

export const ctx: JobContext = {
  msgId: 0,
  readCount: 1,
  extendVisibility: () => Promise.resolve(),
};

/** Mesajele din coadă de un anumit tip, pentru o cheie (ex. event_id). */
export async function queued(type: string, key: string, value: string): Promise<number> {
  const rows = await query<{ n: string }>(
    "select count(*) as n from pgmq.q_media_jobs where message->>'type' = $1 and message->>$2 = $3",
    [type, key, value],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function putObject(bucket: "incoming" | "media" | "archives", path: string, body: Buffer, contentType: string) {
  const { error } = await supabase().storage.from(bucket).upload(path, body, { contentType, upsert: true });
  if (error) throw error;
}

export async function listCount(bucket: "incoming" | "media" | "archives", prefix: string): Promise<number> {
  const { data } = await supabase().storage.from(bucket).list(prefix, { limit: 1000 });
  let n = 0;
  for (const e of data ?? []) n += e.id === null ? await listCount(bucket, `${prefix}/${e.name}`) : 1;
  return n;
}

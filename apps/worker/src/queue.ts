import { query } from "./db.ts";
import type { JobMessage } from "./jobs/types.ts";

export const QUEUE = "media_jobs";

export interface QueuedMessage {
  msg_id: number;
  read_ct: number;
  message: JobMessage;
}

export async function readMessages(visibilitySeconds: number, qty: number): Promise<QueuedMessage[]> {
  const rows = await query<{ msg_id: string; read_ct: number; message: JobMessage }>(
    "select msg_id, read_ct, message from pgmq.read($1, $2, $3)",
    [QUEUE, visibilitySeconds, qty],
  );
  return rows.map((r) => ({ msg_id: Number(r.msg_id), read_ct: r.read_ct, message: r.message }));
}

export async function archiveMessage(msgId: number): Promise<void> {
  await query("select pgmq.archive($1, $2::bigint)", [QUEUE, msgId]);
}

export async function setVisibility(msgId: number, seconds: number): Promise<void> {
  await query("select pgmq.set_vt($1, $2::bigint, $3)", [QUEUE, msgId, seconds]);
}

export async function sendMessage(message: JobMessage): Promise<void> {
  await query("select pgmq.send($1, $2::jsonb)", [QUEUE, JSON.stringify(message)]);
}

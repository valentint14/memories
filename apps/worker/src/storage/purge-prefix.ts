import { supabase, type Bucket } from "./client.ts";

const BATCH = 100;

/** Listează recursiv toate căile de obiecte de sub un prefix. */
async function listAll(bucket: Bucket, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase().storage.from(bucket).list(prefix, { limit: BATCH, offset });
    if (error) throw error;
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      // Directoarele virtuale nu au `id`.
      if (entry.id === null) paths.push(...(await listAll(bucket, path)));
      else paths.push(path);
    }
    if (data.length < BATCH) break;
    offset += BATCH;
  }
  return paths;
}

/**
 * Șterge prin Storage API toate obiectele de sub `{prefix}/` din bucket-urile date, în loturi de
 * 100. Idempotent: un prefix gol înseamnă succes (research.md R11). Întoarce numărul de obiecte.
 */
export async function purgePrefix(prefix: string, buckets: readonly Bucket[]): Promise<number> {
  let removed = 0;
  for (const bucket of buckets) {
    const paths = await listAll(bucket, prefix);
    for (let i = 0; i < paths.length; i += BATCH) {
      const batch = paths.slice(i, i + BATCH);
      const { error } = await supabase().storage.from(bucket).remove(batch);
      if (error) throw error;
      removed += batch.length;
    }
  }
  return removed;
}

/** Șterge căi explicite (fișierele unui media_item), grupate pe bucket. */
export async function removePaths(bucket: Bucket, paths: readonly string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += BATCH) {
    const { error } = await supabase().storage.from(bucket).remove(paths.slice(i, i + BATCH));
    if (error) throw error;
  }
}

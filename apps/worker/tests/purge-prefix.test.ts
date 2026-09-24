import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { supabase, type Bucket } from "../src/storage/client.ts";
import { purgePrefix } from "../src/storage/purge-prefix.ts";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function upload(bucket: Bucket, path: string, body: Buffer, contentType: string): Promise<void> {
  const { error } = await supabase().storage.from(bucket).upload(path, body, { contentType });
  if (error) throw error;
}

async function count(bucket: Bucket, prefix: string): Promise<number> {
  const { data, error } = await supabase().storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw error;
  let total = 0;
  for (const entry of data) {
    total += entry.id === null ? await count(bucket, `${prefix}/${entry.name}`) : 1;
  }
  return total;
}

describe("purgePrefix", () => {
  it("golește un prefix cu peste 100 de obiecte în trei bucket-uri și e idempotent", async () => {
    const eventId = randomUUID();
    const uploads: Promise<void>[] = [];
    for (let i = 0; i < 105; i++) {
      uploads.push(upload("media", `${eventId}/${randomUUID()}/thumb.webp`, PNG, "image/webp"));
    }
    uploads.push(upload("incoming", `${eventId}/${randomUUID()}`, PNG, "image/png"));
    uploads.push(upload("archives", `${eventId}/${randomUUID()}.zip`, Buffer.from("PK\x05\x06" + "\0".repeat(18)), "application/zip"));
    await Promise.all(uploads);
    expect(await count("media", eventId)).toBe(105);

    const removed = await purgePrefix(eventId, ["incoming", "media", "archives"]);
    expect(removed).toBe(107);
    expect(await count("media", eventId)).toBe(0);
    expect(await count("incoming", eventId)).toBe(0);
    expect(await count("archives", eventId)).toBe(0);

    await expect(purgePrefix(eventId, ["incoming", "media", "archives"])).resolves.toBe(0);
  });
});

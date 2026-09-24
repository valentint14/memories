import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { query } from "../src/db.ts";
import { purgeMedia } from "../src/jobs/purge-media.ts";
import { createEvent, ctx, listCount, putObject, randomEmail } from "./support.ts";

describe("purge_media (FR-032, research.md R11)", () => {
  it("golește prefixul fișierului (inclusiv variante apărute după ștergere) și șterge rândul", async () => {
    const event = await createEvent({ organizerEmail: randomEmail("org") });
    const [session] = await query<{ id: string }>("insert into public.guest_sessions (event_id) values ($1) returning id", [event.id]);
    const id = randomUUID();
    await query(
      `insert into public.media_items (id, event_id, guest_session_id, kind, declared_mime, original_filename,
         declared_bytes, incoming_path, status)
       values ($1::uuid, $2::uuid, $3, 'photo', 'image/jpeg', 'a.jpg', 10, $2::text || '/' || $1::text, 'deleting')`,
      [id, event.id, session?.id],
    );
    // Rândul nu are căile variantelor (procesarea era în curs), dar obiectele există.
    await putObject("media", `${event.id}/${id}/original.jpg`, Buffer.from("x"), "image/jpeg");
    await putObject("media", `${event.id}/${id}/thumb.webp`, Buffer.from("x"), "image/webp");
    await putObject("incoming", `${event.id}/${id}`, Buffer.from("x"), "image/jpeg");

    await purgeMedia.run({ type: "purge_media", media_ids: [id], event_id: event.id }, ctx);

    expect(await listCount("media", `${event.id}/${id}`)).toBe(0);
    expect(await listCount("incoming", event.id)).toBe(0);
    expect(await query("select 1 from public.media_items where id = $1", [id])).toEqual([]);
  });

  it("păstrează rândurile `rejected` ca evidență, dar le șterge obiectele", async () => {
    const event = await createEvent({ organizerEmail: randomEmail("org") });
    const [session] = await query<{ id: string }>("insert into public.guest_sessions (event_id) values ($1) returning id", [event.id]);
    const id = randomUUID();
    await query(
      `insert into public.media_items (id, event_id, guest_session_id, kind, declared_mime, original_filename,
         declared_bytes, incoming_path, status)
       values ($1::uuid, $2::uuid, $3, 'photo', 'image/jpeg', 'a.jpg', 10, $2::text || '/' || $1::text, 'rejected')`,
      [id, event.id, session?.id],
    );
    await putObject("incoming", `${event.id}/${id}`, Buffer.from("x"), "image/jpeg");
    await purgeMedia.run({ type: "purge_media", media_ids: [id] }, ctx);
    expect(await listCount("incoming", event.id)).toBe(0);
    expect(await query("select 1 from public.media_items where id = $1", [id])).toHaveLength(1);
  });
});

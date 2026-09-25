import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { query } from "../src/db.ts";
import { deleteOrganizerUser } from "../src/jobs/delete-organizer-user.ts";
import { purgeEvent } from "../src/jobs/purge-event.ts";
import { createEvent, createUser, ctx, listCount, putObject, queued, randomEmail, userExists } from "./support.ts";

describe("purge_event (FR-006b)", () => {
  it("golește Storage-ul, șterge rândurile și cere ștergerea contului rămas fără evenimente", async () => {
    const email = randomEmail("org");
    const userId = await createUser(email);
    const event = await createEvent({ organizerEmail: email });
    await putObject("media", `${event.id}/${randomUUID()}/original.jpg`, Buffer.from("x"), "image/jpeg");
    await putObject("incoming", `${event.id}/${randomUUID()}`, Buffer.from("x"), "image/jpeg");
    await query("update public.events set status = 'deleting' where id = $1", [event.id]);

    await purgeEvent.run({ type: "purge_event", event_id: event.id }, ctx);

    expect(await listCount("media", event.id)).toBe(0);
    expect(await listCount("incoming", event.id)).toBe(0);
    expect(await query("select 1 from public.events where id = $1", [event.id])).toEqual([]);
    expect(await queued("delete_organizer_user", "user_id", userId)).toBe(1);

    // Idempotent: al doilea mesaj pentru același eveniment e un succes fără efect.
    await expect(purgeEvent.run({ type: "purge_event", event_id: event.id }, ctx)).resolves.toBeUndefined();
  });

  it("nu cere ștergerea contului dacă organizatorul mai are alt eveniment", async () => {
    const email = randomEmail("org");
    const userId = await createUser(email);
    const first = await createEvent({ organizerEmail: email });
    await createEvent({ organizerEmail: email });
    await query("update public.events set status = 'deleting' where id = $1", [first.id]);

    await purgeEvent.run({ type: "purge_event", event_id: first.id }, ctx);
    expect(await queued("delete_organizer_user", "user_id", userId)).toBe(0);
  });
});

describe("purge_event — ștergere cerută de organizator (002/FR-035)", () => {
  it("golește Storage-ul, dar păstrează rândul de facturare ca eveniment expirat", async () => {
    const email = randomEmail("org-keep");
    await createUser(email);
    const event = await createEvent({ organizerEmail: email });
    await putObject("media", `${event.id}/${randomUUID()}/original.jpg`, Buffer.from("x"), "image/jpeg");
    await query("update public.events set status = 'deleting', deletion_keeps_billing = true where id = $1", [event.id]);

    await purgeEvent.run({ type: "purge_event", event_id: event.id }, ctx);

    expect(await listCount("media", event.id)).toBe(0);
    const [row] = await query<{ status: string; expired_at: Date | null; deletion_keeps_billing: boolean }>(
      "select status, expired_at, deletion_keeps_billing from public.events where id = $1",
      [event.id],
    );
    expect(row?.status).toBe("expired");
    expect(row?.expired_at).toBeInstanceOf(Date);
    expect(row?.deletion_keeps_billing).toBe(false);
  });
});

describe("delete_organizer_user (FR-047)", () => {
  it("șterge contul orfan", async () => {
    const userId = await createUser(randomEmail("org"));
    await deleteOrganizerUser.run({ type: "delete_organizer_user", user_id: userId }, ctx);
    expect(await userExists(userId)).toBe(false);
  });

  it("păstrează contul care între timp a primit un eveniment nou", async () => {
    const email = randomEmail("org");
    const userId = await createUser(email);
    await createEvent({ organizerEmail: email });
    await deleteOrganizerUser.run({ type: "delete_organizer_user", user_id: userId }, ctx);
    expect(await userExists(userId)).toBe(true);
  });

  it("un utilizator inexistent e un succes", async () => {
    await expect(
      deleteOrganizerUser.run({ type: "delete_organizer_user", user_id: randomUUID() }, ctx),
    ).resolves.toBeUndefined();
  });
});

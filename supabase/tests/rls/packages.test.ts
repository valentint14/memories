import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../../packages/shared/src/db.types.ts";
import { adminClient, closePool, organizerClient, randomEmail, retentionOptionId, sql, type SupabaseClient } from "../support/clients.ts";

// Configurarea pachetului complet și a setărilor (002: FR-015, FR-021; data-model.md › packages).
afterAll(closePool);

let admin: SupabaseClient;
let adminAal1: SupabaseClient;
let organizer: SupabaseClient;
let original: { price_minor: string; max_files_per_guest: number; retention_option_id: string };

beforeAll(async () => {
  admin = (await adminClient({ aal2: true })).client;
  adminAal1 = (await adminClient({ aal2: false })).client;
  organizer = await organizerClient(randomEmail("pkg"));
  const [row] = await sql<typeof original>("select price_minor, max_files_per_guest, retention_option_id from public.packages where code = 'complete'");
  if (!row) throw new Error("pachetul lipsește");
  original = row;
});

afterAll(async () => {
  await sql("update public.packages set price_minor = $1, max_files_per_guest = $2, retention_option_id = $3 where code = 'complete'", [
    original.price_minor,
    original.max_files_per_guest,
    original.retention_option_id,
  ]);
  await sql("update public.self_service_settings set max_awaiting_events_per_organizer = 2");
});

type PackageUpdate = Database["public"]["Tables"]["packages"]["Update"];

async function update(client: SupabaseClient, values: PackageUpdate) {
  return client.from("packages").update(values).eq("code", "complete").select("price_minor");
}

describe("packages", () => {
  it("organizatorul citește prețul, dar nu îl poate modifica", async () => {
    const read = await organizer.from("packages").select("price_minor").eq("code", "complete").single();
    expect(read.data?.price_minor).toBe(Number(original.price_minor));
    const write = await update(organizer, { price_minor: 1 });
    expect(write.data ?? []).toHaveLength(0);
  });

  it("administratorul fără al doilea factor nu îl poate modifica; cu aal2, da", async () => {
    expect((await update(adminAal1, { price_minor: 1 })).data ?? []).toHaveLength(0);
    const ok = await update(admin, { price_minor: 34_900 });
    expect(ok.error).toBeNull();
    expect(ok.data).toEqual([{ price_minor: 34_900 }]);
  });

  it.each([
    [{ price_minor: -1 }],
    [{ max_files_per_guest: 0 }],
    [{ max_files_per_guest: 1001 }],
    [{ max_photo_bytes: 52_428_801 }],
    [{ max_video_bytes: 1_073_741_825 }],
  ])("refuză valorile invalide %o", async (values) => {
    expect((await update(admin, values)).error).not.toBeNull();
  });

  it("refuză o opțiune de retenție inactivă", async () => {
    const optionId = await retentionOptionId(6);
    await sql("update public.retention_options set active = false where id = $1", [optionId]);
    try {
      const result = await update(admin, { retention_option_id: optionId });
      expect(result.error?.message).toBe("OPTION_INACTIVE");
    } finally {
      await sql("update public.retention_options set active = true where id = $1", [optionId]);
    }
  });
});

describe("self_service_settings", () => {
  it("doar administratorul o citește și o modifică, în intervalul 1–20", async () => {
    expect((await organizer.from("self_service_settings").select("*")).data ?? []).toHaveLength(0);
    const ok = await admin.from("self_service_settings").update({ max_awaiting_events_per_organizer: 3 }).eq("id", true).select();
    expect(ok.data).toEqual([expect.objectContaining({ max_awaiting_events_per_organizer: 3 })]);
    const bad = await admin.from("self_service_settings").update({ max_awaiting_events_per_organizer: 21 }).eq("id", true);
    expect(bad.error).not.toBeNull();
  });
});

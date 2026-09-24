import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  anonClient,
  closePool,
  createTestEvent,
  organizerClient,
  randomEmail,
  type TestEvent,
} from "../support/clients.ts";

// Matricea RLS (contracts/database-functions.md) pentru events, retention_options,
// event_retention_changes și platform_admins.

let orgA: SupabaseClient;
let orgB: SupabaseClient;
let adminAal1: SupabaseClient;
let adminAal2: SupabaseClient;
let eventA: TestEvent;

beforeAll(async () => {
  const emailA = randomEmail("org-a");
  orgA = await organizerClient(emailA);
  orgB = await organizerClient(randomEmail("org-b"));
  adminAal1 = (await adminClient({ aal2: false })).client;
  adminAal2 = (await adminClient({ aal2: true })).client;
  eventA = await createTestEvent({ organizerEmail: emailA });
});

afterAll(closePool);

describe("events", () => {
  it("anon nu vede evenimente", async () => {
    const { data } = await anonClient().from("events").select("id").eq("id", eventA.id);
    expect(data ?? []).toEqual([]);
  });

  it("organizatorul A își vede evenimentul, fără public_token", async () => {
    const { data, error } = await orgA.from("events").select("id, final_price_minor").eq("id", eventA.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    const withToken = await orgA.from("events").select("public_token").eq("id", eventA.id);
    expect(withToken.error).not.toBeNull();

    const view = await orgA.from("organizer_events").select("*").eq("id", eventA.id).single();
    expect(view.error).toBeNull();
    expect(view.data).not.toHaveProperty("public_token");
  });

  it("organizatorul B nu vede evenimentul lui A", async () => {
    const { data } = await orgB.from("events").select("id").eq("id", eventA.id);
    expect(data ?? []).toEqual([]);
  });

  it("organizatorul nu poate modifica evenimentul", async () => {
    const { data } = await orgA.from("events").update({ base_price_minor: 0 }).eq("id", eventA.id).select("id");
    expect(data ?? []).toEqual([]);
  });

  it("adminul fără al doilea factor (aal1) nu vede și nu creează evenimente", async () => {
    const { data } = await adminAal1.from("events").select("id").eq("id", eventA.id);
    expect(data ?? []).toEqual([]);
    const { error } = await adminAal1.rpc("admin_event_token", { p_event_id: eventA.id });
    expect(error?.message).toBe("FORBIDDEN");
  });

  it("adminul aal2 vede evenimentul și tokenul prin funcție", async () => {
    const { data } = await adminAal2.from("events").select("id").eq("id", eventA.id);
    expect(data).toHaveLength(1);
    const token = await adminAal2.rpc("admin_event_token", { p_event_id: eventA.id });
    expect(token.data).toBe(eventA.public_token);
  });
});

describe("retention_options", () => {
  it("organizatorul vede doar opțiunile active și nu le poate modifica", async () => {
    const { data } = await orgA.from("retention_options").select("months, active");
    expect(data?.every((o) => o.active)).toBe(true);
    const upd = await orgA.from("retention_options").update({ surcharge_minor: 0 }).eq("months", 12).select("id");
    expect(upd.data ?? []).toEqual([]);
  });

  it("anon nu vede catalogul", async () => {
    const { data } = await anonClient().from("retention_options").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("adminul aal2 poate edita catalogul", async () => {
    const { data, error } = await adminAal2
      .from("retention_options")
      .update({ active: true })
      .eq("months", 12)
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

describe("event_retention_changes și platform_admins", () => {
  it("doar adminul aal2 vede istoricul", async () => {
    const asOrg = await orgA.from("event_retention_changes").select("id").eq("event_id", eventA.id);
    expect(asOrg.data ?? []).toEqual([]);
    const asAdmin = await adminAal2.from("event_retention_changes").select("actor_kind").eq("event_id", eventA.id);
    expect(asAdmin.data?.[0]?.actor_kind).toBe("system");
  });

  it("platform_admins nu e accesibil din client", async () => {
    const { data } = await adminAal2.from("platform_admins").select("user_id");
    expect(data ?? []).toEqual([]);
  });
});

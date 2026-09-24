import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  closePool,
  createTestEvent,
  organizerClient,
  randomEmail,
  retentionOptionId,
  sql,
  type SupabaseClient,
} from "../support/clients.ts";

let orgA: SupabaseClient;
let orgB: SupabaseClient;
let emailA: string;

beforeAll(async () => {
  emailA = randomEmail("org-a");
  orgA = await organizerClient(emailA);
  orgB = await organizerClient(randomEmail("org-b"));
});

afterAll(closePool);

async function extend(client: SupabaseClient, eventId: string, months: number, expected: number) {
  return client.rpc("extend_retention", {
    p_event_id: eventId,
    p_option_id: await retentionOptionId(months),
    p_expected_final_price_minor: expected,
  });
}

describe("extend_retention (FR-041, FR-042, FR-043)", () => {
  it("prelungește la o opțiune mai lungă: snapshot, preț final, dată nouă și istoric „organizer”", async () => {
    const event = await createTestEvent({ organizerEmail: emailA, months: 3, basePriceMinor: 29_900 });
    const { data, error } = await extend(orgA, event.id, 12, 39_800);
    expect(error).toBeNull();
    expect(data?.[0]?.final_price_minor).toBe(39_800);
    expect(new Date(data?.[0]?.purge_at ?? 0).getTime()).toBeGreaterThan(new Date(event.purge_at).getTime());

    const [row] = await sql<{ retention_months: number; final_price_minor: string }>(
      "select retention_months, final_price_minor from public.events where id = $1",
      [event.id],
    );
    expect(row?.retention_months).toBe(12);
    expect(Number(row?.final_price_minor)).toBe(39_800);

    const history = await sql<{ actor_kind: string; from_months: number; to_months: number }>(
      "select actor_kind, from_months, to_months from public.event_retention_changes where event_id = $1 order by id desc limit 1",
      [event.id],
    );
    expect(history[0]).toEqual({ actor_kind: "organizer", from_months: 3, to_months: 12 });
  });

  it("refuză o opțiune mai scurtă sau egală", async () => {
    const event = await createTestEvent({ organizerEmail: emailA, months: 6 });
    expect((await extend(orgA, event.id, 6, event.final_price_minor)).error?.message).toBe("RETENTION_NOT_LONGER");
    expect((await extend(orgA, event.id, 3, 29_900)).error?.message).toBe("RETENTION_NOT_LONGER");
  });

  it("refuză alt organizator", async () => {
    const event = await createTestEvent({ organizerEmail: emailA, months: 3 });
    expect((await extend(orgB, event.id, 12, 39_800)).error?.message).toBe("FORBIDDEN");
  });

  it("refuză un preț așteptat diferit (catalog modificat între timp)", async () => {
    const event = await createTestEvent({ organizerEmail: emailA, months: 3 });
    expect((await extend(orgA, event.id, 12, 38_000)).error?.message).toBe("PRICE_CHANGED");
  });

  it("refuză o opțiune inactivă", async () => {
    const event = await createTestEvent({ organizerEmail: emailA, months: 3 });
    const optionId = await retentionOptionId(6);
    await sql("update public.retention_options set active = false where id = $1", [optionId]);
    try {
      expect((await extend(orgA, event.id, 6, 34_800)).error?.message).toBe("OPTION_INACTIVE");
    } finally {
      await sql("update public.retention_options set active = true where id = $1", [optionId]);
    }
  });

  it("refuză după expirare sau după data ștergerii", async () => {
    const event = await createTestEvent({ organizerEmail: emailA, months: 3 });
    await sql("update public.events set status = 'expiring' where id = $1", [event.id]);
    expect((await extend(orgA, event.id, 12, 39_800)).error?.message).toBe("RETENTION_EXPIRED");
  });
});

describe("retention_quote", () => {
  it("arată prețul și data pentru fiecare opțiune; doar cele mai lungi sunt selectabile", async () => {
    const event = await createTestEvent({ organizerEmail: emailA, months: 6, basePriceMinor: 29_900 });
    const { data, error } = await orgA.rpc("retention_quote", { p_event_id: event.id });
    expect(error).toBeNull();
    const byMonths = Object.fromEntries((data ?? []).map((q) => [q.months, q]));
    expect(byMonths[3]?.selectable).toBe(false);
    expect(byMonths[6]?.selectable).toBe(false);
    expect(byMonths[12]?.selectable).toBe(true);
    expect(byMonths[12]?.final_price_minor).toBe(39_800);
  });
});

describe("catalogul de retenție", () => {
  it("schimbarea suplimentului nu modifică prețul evenimentelor existente (US8-6)", async () => {
    const event = await createTestEvent({ organizerEmail: emailA, months: 12, basePriceMinor: 29_900 });
    const optionId = await retentionOptionId(12);
    await sql("update public.retention_options set surcharge_minor = 15000 where id = $1", [optionId]);
    try {
      const [row] = await sql<{ final_price_minor: string }>("select final_price_minor from public.events where id = $1", [event.id]);
      expect(Number(row?.final_price_minor)).toBe(39_800);
    } finally {
      await sql("update public.retention_options set surcharge_minor = 9900 where id = $1", [optionId]);
    }
  });

  it("o opțiune folosită nu poate fi ștearsă", async () => {
    await createTestEvent({ organizerEmail: emailA, months: 12 });
    await expect(sql("delete from public.retention_options where months = 12")).rejects.toThrow(/foreign key/);
  });
});

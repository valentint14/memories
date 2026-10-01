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

describe("extend_retention (FR-041; 003: FR-020)", () => {
  it("nu mai poate fi apelată de organizator: prelungirea trece prin plată", async () => {
    const event = await createTestEvent({ organizerEmail: emailA, months: 3, basePriceMinor: 29_900 });
    const { error } = await extend(orgA, event.id, 12, 39_800);
    expect(error).not.toBeNull();
    const [row] = await sql<{ retention_months: number }>("select retention_months from public.events where id = $1", [event.id]);
    expect(row?.retention_months).toBe(3);
    // Alt organizator nici atât.
    expect((await extend(orgB, event.id, 12, 39_800)).error).not.toBeNull();
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

import { afterAll, describe, expect, it } from "vitest";
import { closePool, createTestEvent, randomEmail, retentionOptionId, sql } from "../support/clients.ts";

afterAll(closePool);

// Aceleași cazuri ca packages/shared/src/retention.test.ts (FR-040).
describe("compute_purge_at", () => {
  it.each([
    ["2026-02-15T10:00:00Z", 3, "2026-05-15T09:00:00.000Z"],
    // 1 oct 00:00 EEST + 6 luni = 1 apr 00:00 EEST (ora de vară începe pe 28 mar 2027)
    ["2026-09-30T21:00:00Z", 6, "2027-03-31T21:00:00.000Z"],
    ["2026-11-20T10:00:00Z", 12, "2027-11-20T10:00:00.000Z"],
  ])("sfârșit upload %s + %i luni = %s", async (endsAt, months, expected) => {
    const end = new Date(endsAt);
    const event = await createTestEvent({
      organizerEmail: randomEmail("org"),
      months,
      uploadStartsAt: new Date(end.getTime() - 3_600_000),
      uploadEndsAt: end,
    });
    expect(new Date(event.purge_at).toISOString()).toBe(expected);
  });

  it("31 ianuarie + 1 lună ajunge la sfârșitul lui februarie (ca în Postgres)", async () => {
    const rows = await sql<{ purge_at: Date }>(
      `select ((timestamptz '2026-01-31T18:00:00Z' at time zone 'Europe/Bucharest')
               + make_interval(months => 1)) at time zone 'Europe/Bucharest' as purge_at`,
    );
    expect(rows[0]?.purge_at.toISOString()).toBe("2026-02-28T18:00:00.000Z");
  });

  it("prețul final = bază + suplimentul opțiunii", async () => {
    const event = await createTestEvent({ organizerEmail: randomEmail("org"), months: 12, basePriceMinor: 29_900 });
    expect(event.final_price_minor).toBe(39_800);
  });

  it("recalculează data ștergerii la schimbarea sfârșitului uploadului", async () => {
    const event = await createTestEvent({ organizerEmail: randomEmail("org"), months: 3 });
    const newEnd = new Date(Date.now() + 10 * 24 * 3_600_000);
    const rows = await sql<{ purge_at: Date }>(
      "update public.events set upload_ends_at = $2 where id = $1 returning purge_at",
      [event.id, newEnd],
    );
    expect(rows[0]?.purge_at.getTime()).toBeGreaterThan(new Date(event.purge_at).getTime());
  });

  it("refuză o modificare care ar pune data ștergerii în trecut", async () => {
    const event = await createTestEvent({ organizerEmail: randomEmail("org"), months: 3 });
    const start = new Date(Date.now() - 400 * 24 * 3_600_000);
    await expect(
      sql("update public.events set upload_starts_at = $2, upload_ends_at = $3 where id = $1", [
        event.id,
        start,
        new Date(start.getTime() + 3_600_000),
      ]),
    ).rejects.toThrow("RETENTION_DATE_IN_PAST");
  });

  it("refuză o opțiune inactivă", async () => {
    const optionId = await retentionOptionId(6);
    await sql("update public.retention_options set active = false where id = $1", [optionId]);
    try {
      await expect(createTestEvent({ organizerEmail: randomEmail("org"), months: 6 })).rejects.toThrow(
        "OPTION_INACTIVE",
      );
    } finally {
      await sql("update public.retention_options set active = true where id = $1", [optionId]);
    }
  });

  it("scrie un rând de istoric „system” la creare", async () => {
    const event = await createTestEvent({ organizerEmail: randomEmail("org"), months: 3 });
    const rows = await sql<{ actor_kind: string; to_months: number; from_months: number | null }>(
      "select actor_kind, to_months, from_months from public.event_retention_changes where event_id = $1",
      [event.id],
    );
    expect(rows).toEqual([{ actor_kind: "system", to_months: 3, from_months: null }]);
  });
});

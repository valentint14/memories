import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closePool, sql } from "../support/clients.ts";

// `check_rate_limit` și curățenia periodică: o fereastră lungă nu trebuie ștearsă înainte să se încheie.
afterAll(closePool);

// Comanda jobului `cleanup_rate_limits` (20261012000100_rate_limit_window_end.sql).
const CLEANUP = "delete from public.rate_limit_counters where window_end < now()";

async function hit(key: string, limit: number, window: string): Promise<boolean> {
  const [row] = await sql<{ ok: boolean }>("select public.check_rate_limit($1, $2, $3::interval) as ok", [key, limit, window]);
  return row?.ok ?? false;
}

describe("check_rate_limit", () => {
  it("refuză cererile peste limită în aceeași fereastră", async () => {
    const key = `test:${randomUUID()}`;
    expect(await hit(key, 2, "1 hour")).toBe(true);
    expect(await hit(key, 2, "1 hour")).toBe(true);
    expect(await hit(key, 2, "1 hour")).toBe(false);
  });

  it("păstrează sfârșitul ferestrei pe rând", async () => {
    const key = `test:${randomUUID()}`;
    await hit(key, 5, "24 hours");
    const [row] = await sql<{ hours: number }>(
      "select extract(epoch from (window_end - window_start)) / 3600 as hours from public.rate_limit_counters where bucket_key = $1",
      [key],
    );
    expect(Number(row?.hours)).toBe(24);
  });

  it("curățenia nu șterge o fereastră de 24 de ore încă deschisă, deci limita rămâne în vigoare", async () => {
    const key = `test:${randomUUID()}`;
    expect(await hit(key, 2, "24 hours")).toBe(true);
    expect(await hit(key, 2, "24 hours")).toBe(true);
    // O fereastră începută acum mai bine de o oră: vechiul job (window_start < now() - 1 oră) ar fi șters-o.
    await sql("update public.rate_limit_counters set window_start = window_start - interval '2 hours', window_end = window_end + interval '10 minutes' where bucket_key = $1", [key]);
    await sql(CLEANUP);
    const left = await sql("select 1 from public.rate_limit_counters where bucket_key = $1", [key]);
    expect(left).toHaveLength(1);
  });

  it("curățenia șterge ferestrele încheiate", async () => {
    const key = `test:${randomUUID()}`;
    await hit(key, 2, "1 minute");
    await sql("update public.rate_limit_counters set window_end = now() - interval '1 minute' where bucket_key = $1", [key]);
    await sql(CLEANUP);
    expect(await sql("select 1 from public.rate_limit_counters where bucket_key = $1", [key])).toHaveLength(0);
  });

  it("jobul programat folosește aceeași condiție", async () => {
    const [job] = await sql<{ command: string }>("select command from cron.job where jobname = 'cleanup_rate_limits'");
    expect(job?.command).toContain("window_end < now()");
  });
});

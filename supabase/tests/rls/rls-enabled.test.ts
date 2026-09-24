import { afterAll, describe, expect, it } from "vitest";
import { closePool, sql } from "../support/clients.ts";

afterAll(closePool);

// Constituția, principiul III: RLS activ pe toate tabelele, fără excepție.
describe("RLS", () => {
  it("este activ pe fiecare tabel din schema public", async () => {
    const rows = await sql<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' and not rowsecurity order by tablename",
    );
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });
});

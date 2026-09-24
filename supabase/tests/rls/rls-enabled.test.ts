import { afterAll, describe, expect, it } from "vitest";
import { closePool, organizerClient, randomEmail, sql, anonClient } from "../support/clients.ts";

afterAll(closePool);

// Tabelele noi din 002 (data-model.md › Tabele noi).
const TABLES_002 = [
  "packages",
  "self_service_settings",
  "event_status_transitions",
  "event_status_changes",
  "auth_requests",
  "legal_documents",
  "terms_acceptances",
  "activation_requests",
  "app_audit_log",
];

// Constituția, principiul III: RLS activ pe toate tabelele, fără excepție.
describe("RLS", () => {
  it("este activ pe fiecare tabel din schema public", async () => {
    const rows = await sql<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' and not rowsecurity order by tablename",
    );
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });

  it("tabelele din 002 există și au RLS activ", async () => {
    const rows = await sql<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' and rowsecurity and tablename = any($1) order by tablename",
      [TABLES_002],
    );
    expect(rows.map((r) => r.tablename)).toEqual([...TABLES_002].sort());
  });

  it.each(["auth_requests", "app_audit_log"])("%s nu este accesibil clienților", async (table) => {
    const organizer = await organizerClient(randomEmail("rls-002"));
    for (const client of [anonClient(), organizer]) {
      const read = await client.from(table as "auth_requests").select("*").limit(1);
      expect(read.error).not.toBeNull();
    }
  });
});

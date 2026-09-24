import pg from "pg";
import { config } from "./config.ts";
import { log } from "./log.ts";

let pool: pg.Pool | undefined;

/** Conexiune Postgres directă (pgmq, funcții service role) — research.md R1, R7. */
export function db(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 4 });
    // O conexiune inactivă căzută (restart DB, rețea) nu trebuie să oprească procesul.
    pool.on("error", (error) => {
      log.warn({ job: "db", error_code: error.name }, "conexiune Postgres pierdută");
    });
  }
  return pool;
}

export async function query<T extends pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await db().query<T>(text, params);
  return res.rows;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

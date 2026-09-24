import pg from "pg";
import { config } from "./config.ts";

let pool: pg.Pool | undefined;

/** Conexiune Postgres directă (pgmq, funcții service role) — research.md R1, R7. */
export function db(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: config.databaseUrl, max: 4 });
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

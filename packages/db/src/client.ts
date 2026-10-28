import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

type Handle = { db: DB; sql: postgres.Sql };

// One pool per process (and one per URL, so tests can point at a separate database).
// Kept on globalThis so Next.js dev reloads don't leak connections.
const g = globalThis as unknown as { __tidalDb?: Map<string, Handle> };

export function getDb(url = process.env.DATABASE_URL): Handle {
  if (!url) throw new Error("DATABASE_URL is not set");
  g.__tidalDb ??= new Map();
  let h = g.__tidalDb.get(url);
  if (!h) {
    const sql = postgres(url, { max: 10, onnotice: () => {} });
    h = { sql, db: drizzle(sql, { schema }) };
    g.__tidalDb.set(url, h);
  }
  return h;
}

export async function closeDb(url = process.env.DATABASE_URL) {
  const h = url ? g.__tidalDb?.get(url) : undefined;
  if (h) {
    await h.sql.end();
    g.__tidalDb!.delete(url!);
  }
}

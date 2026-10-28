/** Drop everything, re-run migrations and seed. Local/test databases only. */
import "dotenv/config";
import postgres from "postgres";
import { closeDb } from "@tidal/db";
import { runMigrations } from "@tidal/db/migrate";
import { seed } from "./seed";

export async function resetDatabase(url: string, opts: { seed?: boolean } = {}) {
  if (/supabase\.(co|com)|amazonaws|neon\.tech/.test(url)) throw new Error("Refusing to reset a hosted database");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe(`
    drop schema if exists public cascade;
    drop schema if exists app cascade;
    drop schema if exists drizzle cascade;
    create schema public;
  `);
  await sql.end();
  await runMigrations(url);
  if (opts.seed !== false) return seed(url);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL!;
  const counts = await resetDatabase(url);
  await closeDb(url);
  console.log("reset complete", counts);
}

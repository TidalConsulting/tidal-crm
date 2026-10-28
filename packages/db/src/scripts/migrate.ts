import "../env";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { closeDb, getDb } from "../client";

export async function runMigrations(url: string) {
  const { db } = getDb(url);
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../migrations", import.meta.url)) });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL!;
  await runMigrations(url);
  await closeDb(url);
  console.log("migrations applied");
}

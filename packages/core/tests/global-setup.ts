import "dotenv/config";
import { closeDb } from "@tidal/db";
import { resetDatabase } from "../src/scripts/reset";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  await resetDatabase(url);
  await closeDb(url);
}

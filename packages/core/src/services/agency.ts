import { eq } from "drizzle-orm";
import { recordChange, schema, type Actor, type Tx } from "@tidal/db";
import { guard, NotFoundError, ValidationError } from "../errors";

const { agencies } = schema;

export async function getAgency(tx: Tx, id: string) {
  const [a] = await tx.select().from(agencies).where(eq(agencies.id, id));
  return a ?? null;
}

export async function updateAgency(tx: Tx, actor: Actor, id: string, input: { name: string }) {
  const name = input.name.trim();
  if (!name) throw new ValidationError("Name is required");
  const before = await getAgency(tx, id);
  if (!before) throw new NotFoundError();
  const rows = await guard(tx.update(agencies).set({ name }).where(eq(agencies.id, id)).returning());
  if (rows.length === 0) throw new NotFoundError();
  await recordChange(tx, actor, { type: "agency.updated", entity: "agency", entityId: id, locationId: null, agencyId: id, before, after: rows[0] });
  return rows[0]!;
}

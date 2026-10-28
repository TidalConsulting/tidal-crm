import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { recordChange, schema, type Actor, type Tx } from "@tidal/db";
import { guard, isUniqueViolation, ValidationError } from "../errors";

const { contacts } = schema;

/** Normalize a US-centric phone to E.164. Returns null if it can't. */
export function toE164(raw: string | null | undefined, defaultCountry = "1"): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (trimmed.startsWith("+")) return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.length === 10) return `+${defaultCountry}${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export type ContactInput = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
};

export async function createContact(tx: Tx, actor: Actor, locationId: string, input: ContactInput) {
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone ? toE164(input.phone) : null;
  if (input.phone && !phone) throw new ValidationError("Phone number isn't valid");
  try {
    const [c] = await guard(
      tx
        .insert(contacts)
        .values({
          locationId,
          firstName: input.firstName?.trim() || null,
          lastName: input.lastName?.trim() || null,
          email,
          phone,
          source: input.source ?? null,
          createdBy: actor.type === "user" ? actor.userId : null,
        })
        .returning(),
    );
    await recordChange(tx, actor, { type: "contact.created", entity: "contact", entityId: c!.id, locationId, after: c });
    return c!;
  } catch (e) {
    if (isUniqueViolation(e)) throw new ValidationError("A contact with that email or phone already exists");
    throw e;
  }
}

/** Server-side paginated contact list (phase 1: read-only view; full table view comes in phase 2). */
export async function listContacts(tx: Tx, opts: { locationId: string; q?: string; page?: number; pageSize?: number }) {
  const pageSize = Math.min(opts.pageSize ?? 25, 100);
  const page = Math.max(opts.page ?? 1, 1);
  const filters: SQL[] = [eq(contacts.locationId, opts.locationId), isNull(contacts.deletedAt)];
  const q = opts.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "\\$&")}%`;
    filters.push(
      or(
        ilike(contacts.firstName, like),
        ilike(contacts.lastName, like),
        ilike(contacts.email, like),
        ilike(contacts.phone, like),
        sql`(${contacts.firstName} || ' ' || ${contacts.lastName}) ilike ${like}`,
      )!,
    );
  }
  const where = and(...filters);
  const [rows, [{ total } = { total: 0 }]] = await Promise.all([
    tx.select().from(contacts).where(where).orderBy(desc(contacts.createdAt), desc(contacts.id)).limit(pageSize).offset((page - 1) * pageSize),
    tx.select({ total: sql<number>`count(*)::int` }).from(contacts).where(where),
  ]);
  return { rows, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

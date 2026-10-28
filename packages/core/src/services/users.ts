import { eq, sql } from "drizzle-orm";
import { schema, withSystem, type Tx } from "@tidal/db";

const { users } = schema;

/**
 * Find or create the users row for someone signing in. Trusted code only (runs on the owner role).
 * With Supabase Auth, `id` is auth.users.id. A row created earlier by an invite (matched by email) is re-keyed to it.
 */
export async function provisionUser(input: { id?: string; email: string; name?: string | null; avatarUrl?: string | null }) {
  const email = input.email.trim().toLowerCase();
  return withSystem(async (tx) => {
    const [existing] = await tx.select().from(users).where(sql`lower(${users.email}) = ${email}`);
    if (existing) {
      if (input.id && existing.id !== input.id) {
        // Invited before first login: adopt the auth id everywhere this user is referenced.
        await rekeyUser(tx, existing.id, input.id);
      }
      const [u] = await tx
        .update(users)
        .set({ name: existing.name ?? input.name ?? null, avatarUrl: input.avatarUrl ?? existing.avatarUrl })
        .where(eq(users.id, input.id ?? existing.id))
        .returning();
      return u!;
    }
    const [u] = await tx
      .insert(users)
      .values({ id: input.id, email, name: input.name ?? null, avatarUrl: input.avatarUrl ?? null })
      .returning();
    return u!;
  });
}

async function rekeyUser(tx: Tx, from: string, to: string) {
  await tx.execute(sql`insert into users (id, email, name, avatar_url, last_location_id, created_at)
    select ${to}, email || '#rekey', name, avatar_url, last_location_id, created_at from users where id = ${from}`);
  await tx.execute(sql`update memberships set user_id = ${to} where user_id = ${from}`);
  await tx.execute(sql`update contacts set owner_id = ${to} where owner_id = ${from}`);
  await tx.execute(sql`update dashboards set owner_id = ${to} where owner_id = ${from}`);
  await tx.execute(sql`delete from users where id = ${from}`);
  await tx.execute(sql`update users set email = replace(email, '#rekey', '') where id = ${to}`);
}

export async function getUserById(id: string) {
  return withSystem(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, id));
    return u ?? null;
  });
}

/** Users for the dev-mode login picker. Never used when AUTH_MODE=supabase. */
export async function listUsersForDevLogin() {
  return withSystem((tx) => tx.select({ id: users.id, email: users.email, name: users.name }).from(users).orderBy(users.email));
}

/** Remember the last-used sub-account (SPEC §6: switcher remembers it). */
export async function setLastLocation(tx: Tx, userId: string, locationId: string) {
  await tx.update(users).set({ lastLocationId: locationId }).where(eq(users.id, userId));
}

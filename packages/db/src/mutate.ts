import { auditLog, events } from "./schema";
import type { Actor } from "./tenant";
import type { Tx } from "./client";

export type Change = {
  /** e.g. "contact.created", "location.updated". Used as the audit action and the event type. */
  type: string;
  entity: string;
  entityId: string | null;
  locationId: string | null;
  agencyId?: string | null;
  before?: unknown;
  after?: unknown;
  /** Event payload. Defaults to `after`. */
  payload?: Record<string, unknown>;
};

/**
 * Write the audit_log row and the domain event for a change, in the caller's transaction.
 * Every mutation in the service layer must call this (SPEC engineering rules).
 */
export async function recordChange(tx: Tx, actor: Actor, c: Change) {
  const actorId = actor.type === "user" ? actor.userId : null;
  await tx.insert(auditLog).values({
    agencyId: c.agencyId ?? null,
    locationId: c.locationId,
    actorId,
    actorType: actor.type,
    action: actor.type === "system" ? `${c.type} (${actor.name})` : c.type,
    entity: c.entity,
    entityId: c.entityId,
    before: (c.before ?? null) as object | null,
    after: (c.after ?? null) as object | null,
  });
  await tx.insert(events).values({
    agencyId: c.agencyId ?? null,
    locationId: c.locationId,
    type: c.type,
    entity: c.entity,
    entityId: c.entityId,
    payload: c.payload ?? ((c.after ?? {}) as Record<string, unknown>),
  });
}

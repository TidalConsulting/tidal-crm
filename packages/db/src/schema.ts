import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Base columns for every table (SPEC §5). Tenant tables add `location_id` via `tenant()`.
const base = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

const tenant = () => ({
  ...base(),
  locationId: uuid("location_id")
    .notNull()
    .references(() => locations.id),
});

export const ROLES = ["agency_admin", "agency_viewer", "location_admin", "user"] as const;
export type Role = (typeof ROLES)[number];

export const agencies = pgTable("agencies", {
  ...base(),
  name: text("name").notNull(),
  branding: jsonb("branding").notNull().default({}),
  settings: jsonb("settings").notNull().default({}),
});

export const snapshots = pgTable("snapshots", {
  ...base(),
  agencyId: uuid("agency_id")
    .notNull()
    .references(() => agencies.id),
  name: text("name").notNull(),
  payload: jsonb("payload").notNull().default({}),
});

export const locations = pgTable(
  "locations",
  {
    ...base(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    legalName: text("legal_name"),
    timezone: text("timezone").notNull().default("America/New_York"),
    phoneNumber: text("phone_number"),
    email: text("email"),
    website: text("website"),
    address: text("address"),
    sendingDomain: text("sending_domain"),
    stripeAccountId: text("stripe_account_id"),
    snapshotId: uuid("snapshot_id").references(() => snapshots.id),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("locations_agency_slug_key").on(t.agencyId, t.slug)],
);

export const users = pgTable(
  "users",
  {
    ...base(),
    // Equals auth.users.id when Supabase Auth is on. No FK, so local dev runs without Supabase.
    email: text("email").notNull(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    lastLocationId: uuid("last_location_id").references(() => locations.id),
  },
  (t) => [uniqueIndex("users_email_key").on(sql`lower(${t.email})`)],
);

export const memberships = pgTable(
  "memberships",
  {
    ...base(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    agencyId: uuid("agency_id").references(() => agencies.id),
    locationId: uuid("location_id").references(() => locations.id),
    role: text("role", { enum: ROLES }).notNull(),
    permissions: jsonb("permissions").notNull().default({}),
  },
  (t) => [
    check("memberships_scope_check", sql`(${t.agencyId} is null) <> (${t.locationId} is null)`),
    check(
      "memberships_role_scope_check",
      sql`(${t.agencyId} is not null and ${t.role} in ('agency_admin','agency_viewer'))
       or (${t.locationId} is not null and ${t.role} in ('location_admin','user'))`,
    ),
    uniqueIndex("memberships_user_location_key")
      .on(t.userId, t.locationId)
      .where(sql`${t.deletedAt} is null and ${t.locationId} is not null`),
    uniqueIndex("memberships_user_agency_key")
      .on(t.userId, t.agencyId)
      .where(sql`${t.deletedAt} is null and ${t.agencyId} is not null`),
    index("memberships_location_idx").on(t.locationId),
  ],
);

// Audit and events: location_id is null for agency-level actions (e.g. team changes).
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    agencyId: uuid("agency_id").references(() => agencies.id),
    locationId: uuid("location_id").references(() => locations.id),
    actorId: uuid("actor_id"),
    actorType: text("actor_type", { enum: ["user", "system", "api_key"] }).notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
  },
  (t) => [
    index("audit_log_location_created_idx").on(t.locationId, t.createdAt),
    index("audit_log_entity_idx").on(t.entity, t.entityId),
  ],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    agencyId: uuid("agency_id").references(() => agencies.id),
    locationId: uuid("location_id").references(() => locations.id),
    type: text("type").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    payload: jsonb("payload").notNull().default({}),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
  },
  (t) => [
    index("events_unprocessed_idx").on(t.createdAt).where(sql`${t.processedAt} is null`),
    index("events_location_type_idx").on(t.locationId, t.type, t.createdAt),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    ...tenant(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    companyId: uuid("company_id"),
    ownerId: uuid("owner_id").references(() => users.id),
    source: text("source"),
    dndSms: boolean("dnd_sms").notNull().default(false),
    dndEmail: boolean("dnd_email").notNull().default(false),
    leadScore: integer("lead_score"),
    custom: jsonb("custom").notNull().default({}),
  },
  (t) => [
    uniqueIndex("contacts_location_email_key")
      .on(t.locationId, sql`lower(${t.email})`)
      .where(sql`${t.deletedAt} is null and ${t.email} is not null`),
    uniqueIndex("contacts_location_phone_key")
      .on(t.locationId, t.phone)
      .where(sql`${t.deletedAt} is null and ${t.phone} is not null`),
    index("contacts_location_created_idx").on(t.locationId, t.createdAt),
  ],
);

export const pipelines = pgTable(
  "pipelines",
  {
    ...tenant(),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("pipelines_location_idx").on(t.locationId)],
);

export const pipelineStages = pgTable(
  "pipeline_stages",
  {
    ...tenant(),
    pipelineId: uuid("pipeline_id")
      .notNull()
      .references(() => pipelines.id),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    probability: integer("probability").notNull().default(0),
  },
  (t) => [index("pipeline_stages_pipeline_idx").on(t.pipelineId, t.position)],
);

// Dashboards: location_id null + agency_id set = agency roll-up dashboard.
export const dashboards = pgTable(
  "dashboards",
  {
    ...base(),
    agencyId: uuid("agency_id").references(() => agencies.id),
    locationId: uuid("location_id").references(() => locations.id),
    name: text("name").notNull(),
    ownerId: uuid("owner_id").references(() => users.id),
    shared: boolean("shared").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    layout: jsonb("layout").notNull().default([]),
    dateRange: text("date_range").notNull().default("30d"),
  },
  (t) => [
    check("dashboards_scope_check", sql`(${t.agencyId} is null) <> (${t.locationId} is null)`),
    index("dashboards_location_idx").on(t.locationId),
  ],
);

export const dashboardWidgets = pgTable(
  "dashboard_widgets",
  {
    ...base(),
    dashboardId: uuid("dashboard_id")
      .notNull()
      .references(() => dashboards.id),
    // Copied from the parent dashboard so RLS can check it without a join.
    agencyId: uuid("agency_id").references(() => agencies.id),
    locationId: uuid("location_id").references(() => locations.id),
    type: text("type").notNull(),
    metric: text("metric").notNull(),
    viz: text("viz", { enum: ["stat", "line", "bar", "funnel", "table", "pie"] }).notNull(),
    filters: jsonb("filters").notNull().default({}),
    position: jsonb("position").notNull().default({}),
    settings: jsonb("settings").notNull().default({}),
  },
  (t) => [
    check("dashboard_widgets_scope_check", sql`(${t.agencyId} is null) <> (${t.locationId} is null)`),
    index("dashboard_widgets_dashboard_idx").on(t.dashboardId),
  ],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    ...tenant(),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("api_keys_hash_key").on(t.keyHash)],
);

export type Location = typeof locations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Contact = typeof contacts.$inferSelect;


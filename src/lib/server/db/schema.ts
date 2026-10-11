/**
 * The platform's own tables.
 *
 * Still no domain records: farmers, crops and shipments stay in the systems
 * this coordinates. What lives here is what has to outlive a process and be
 * shared across instances — the audit trail, the agents' decision log, and
 * who may sign in. Paused workflow runs live beside these in the LangGraph
 * checkpointer's own tables, which that library creates and owns.
 *
 * Change a table here, then `npm run db:generate` to write the migration.
 */

import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** Append-only: a database trigger refuses UPDATE and DELETE (see the 0001 migration). */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: integer("entity_id"),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_created_at_idx").on(table.createdAt),
    index("audit_logs_actor_idx").on(table.actor),
  ]
);

export const agentActivities = pgTable(
  "agent_activities",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    agentName: text("agent_name").notNull(),
    action: text("action").notNull(),
    confidence: doublePrecision("confidence"),
    /** JSON text, exactly as the API has always returned it. */
    context: text("context"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("agent_activities_created_at_idx").on(table.createdAt),
    index("agent_activities_agent_name_idx").on(table.agentName),
  ]
);

/**
 * People granted access from the console, on top of the environment
 * allow-lists. An address named in the environment keeps that role whatever
 * this table says, so an admin cannot lock out the deployment's owners.
 */
export const users = pgTable(
  "users",
  {
    email: text("email").primaryKey(),
    name: text("name"),
    role: text("role").notNull(),
    disabled: boolean("disabled").notNull().default(false),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
  },
  (table) => [
    check("users_role_check", sql`${table.role} in ('viewer', 'operator', 'admin')`),
    check("users_email_lower_check", sql`${table.email} = lower(${table.email})`),
  ]
);

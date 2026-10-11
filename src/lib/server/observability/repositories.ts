/**
 * Data access for the observability records — the repository layer.
 *
 * Two backends behind one async interface: Postgres when `DATABASE_URL` is
 * set, so every instance reads and writes the same trail, and the
 * process-local store otherwise. Callers never know which; the readiness
 * probe reports it.
 */

import { and, count as countRows, desc, eq, type SQL } from "drizzle-orm";

import { databaseConfigured, getDatabase } from "../db/client";
import * as tables from "../db/schema";
import type { AgentActivity, AuditLog, Row } from "./models";
import { getDb, insert, type Table } from "./store";

export interface ListOptions {
  skip?: number;
  limit?: number;
}

export interface Repository<T extends Row, F> {
  /** Newest first, matching every non-null filter, then offset/limit. */
  list(options?: ListOptions & F): Promise<T[]>;
  create(data: Omit<T, "id">): Promise<T>;
  count(): Promise<number>;
}

export type StoreKind = "postgres" | "memory";

export function storeKind(): StoreKind {
  return databaseConfigured() ? "postgres" : "memory";
}

function memoryRepository<T extends Row, F extends object>(
  select: () => Table<T>
): Repository<T, F> {
  return {
    async list(options = {} as ListOptions & F) {
      const { skip = 0, limit = 100, ...filters } = options;
      const entries = Object.entries(filters).filter(
        ([, value]) => value !== undefined && value !== null
      );
      return select()
        .rows.filter((row) => entries.every(([field, value]) => row[field as keyof T] === value))
        .sort((a, b) => b.id - a.id)
        .slice(skip, skip + limit);
    },
    async create(data) {
      return insert(select(), data);
    },
    async count() {
      return select().rows.length;
    },
  };
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString().replace(/\.\d{3}Z$/, "Z") : null;
}

function when(created: string | null): Date | undefined {
  return created ? new Date(created) : undefined;
}

type AuditFilters = { actor?: string | null; entity_type?: string | null };
type ActivityFilters = { agent_name?: string | null };

const postgresAuditLogs: Repository<AuditLog, AuditFilters> = {
  async list({ skip = 0, limit = 100, actor, entity_type } = {}) {
    const db = await getDatabase();
    const where: SQL[] = [];
    if (actor) where.push(eq(tables.auditLogs.actor, actor));
    if (entity_type) where.push(eq(tables.auditLogs.entityType, entity_type));
    const rows = await db
      .select()
      .from(tables.auditLogs)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(tables.auditLogs.id))
      .offset(skip)
      .limit(limit);
    return rows.map(toAuditLog);
  },
  async create(data) {
    const db = await getDatabase();
    const [row] = await db
      .insert(tables.auditLogs)
      .values({
        actor: data.actor,
        action: data.action,
        entityType: data.entity_type,
        entityId: data.entity_id,
        detail: data.detail,
        createdAt: when(data.created_at),
      })
      .returning();
    return toAuditLog(row);
  },
  async count() {
    const db = await getDatabase();
    const [row] = await db.select({ n: countRows() }).from(tables.auditLogs);
    return row.n;
  },
};

function toAuditLog(row: typeof tables.auditLogs.$inferSelect): AuditLog {
  return {
    id: row.id,
    actor: row.actor,
    action: row.action,
    entity_type: row.entityType,
    entity_id: row.entityId,
    detail: row.detail,
    created_at: iso(row.createdAt),
  };
}

const postgresAgentActivities: Repository<AgentActivity, ActivityFilters> = {
  async list({ skip = 0, limit = 100, agent_name } = {}) {
    const db = await getDatabase();
    const rows = await db
      .select()
      .from(tables.agentActivities)
      .where(agent_name ? eq(tables.agentActivities.agentName, agent_name) : undefined)
      .orderBy(desc(tables.agentActivities.id))
      .offset(skip)
      .limit(limit);
    return rows.map(toAgentActivity);
  },
  async create(data) {
    const db = await getDatabase();
    const [row] = await db
      .insert(tables.agentActivities)
      .values({
        agentName: data.agent_name,
        action: data.action,
        confidence: data.confidence,
        context: data.context,
        createdAt: when(data.created_at),
      })
      .returning();
    return toAgentActivity(row);
  },
  async count() {
    const db = await getDatabase();
    const [row] = await db.select({ n: countRows() }).from(tables.agentActivities);
    return row.n;
  },
};

function toAgentActivity(row: typeof tables.agentActivities.$inferSelect): AgentActivity {
  return {
    id: row.id,
    agent_name: row.agentName,
    action: row.action,
    confidence: row.confidence,
    context: row.context,
    created_at: iso(row.createdAt),
  };
}

const memoryAuditLogs = memoryRepository<AuditLog, AuditFilters>(() => getDb().audit_logs);
const memoryAgentActivities = memoryRepository<AgentActivity, ActivityFilters>(
  () => getDb().agent_activities
);

/** Chosen per call, so a test or a process can change `DATABASE_URL` and be obeyed. */
function pick<T extends Row, F>(postgres: Repository<T, F>, memory: Repository<T, F>): Repository<T, F> {
  return {
    list: (options) => (databaseConfigured() ? postgres : memory).list(options),
    create: (data) => (databaseConfigured() ? postgres : memory).create(data),
    count: () => (databaseConfigured() ? postgres : memory).count(),
  };
}

export const auditLogs = pick(postgresAuditLogs, memoryAuditLogs);
export const agentActivities = pick(postgresAgentActivities, memoryAgentActivities);

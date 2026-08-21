/**
 * Data access for the observability records — the repository layer.
 *
 * A single generic factory covers get/list/create against an in-memory table,
 * which is all these two entities need.
 */

import type { AgentActivity, AuditLog, Row } from "./models";
import { getDb, insert, type Table } from "./store";

export interface ListOptions {
  skip?: number;
  limit?: number;
}

export interface Repository<T extends Row> {
  get(id: number): T | null;
  /** Rows matching every non-null filter, then offset/limit. */
  list(options?: ListOptions & Partial<Record<keyof T, unknown>>): T[];
  create(data: Omit<T, "id">): T;
  count(): number;
  all(): T[];
}

function createRepository<T extends Row>(select: () => Table<T>): Repository<T> {
  return {
    get(id) {
      return select().rows.find((row) => row.id === id) ?? null;
    },
    list(options = {}) {
      const { skip = 0, limit = 100, ...filters } = options;
      const entries = Object.entries(filters).filter(
        ([, value]) => value !== undefined && value !== null
      );
      const matches = select()
        .rows.filter((row) => entries.every(([field, value]) => row[field as keyof T] === value))
        .sort((a, b) => b.id - a.id);
      return matches.slice(skip, skip + limit);
    },
    create(data) {
      return insert(select(), data);
    },
    count() {
      return select().rows.length;
    },
    all() {
      return select().rows;
    },
  };
}

export const agentActivities = createRepository<AgentActivity>(() => getDb().agent_activities);
export const auditLogs = createRepository<AuditLog>(() => getDb().audit_logs);

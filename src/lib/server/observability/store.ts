/**
 * In-memory store for the platform's own observability records.
 *
 * There is no demo seed and no domain data here by design: this layer reads
 * from upstream sources rather than owning records. What it stores is its own
 * behaviour — agent decisions and the audit trail — which is process-local and
 * held on `globalThis` so it is shared by every route handler in the process
 * and survives hot reloads in development.
 */

import type { AgentActivity, AuditLog, Row } from "./models";

export interface Table<T extends Row> {
  rows: T[];
  nextId: number;
}

export interface Database {
  agent_activities: Table<AgentActivity>;
  audit_logs: Table<AuditLog>;
}

function table<T extends Row>(): Table<T> {
  return { rows: [], nextId: 1 };
}

function createDatabase(): Database {
  return {
    agent_activities: table<AgentActivity>(),
    audit_logs: table<AuditLog>(),
  };
}

const globalStore = globalThis as typeof globalThis & { __nexusGridDb?: Database };

/**
 * The single process-wide store instance.
 *
 * Validates the shape rather than just checking existence: the global survives
 * hot reloads, so it can hold a layout written by an older version of this
 * module, and reading a missing table off it fails obscurely.
 */
export function getDb(): Database {
  const existing = globalStore.__nexusGridDb;
  if (!existing || !Array.isArray(existing.agent_activities?.rows)) {
    const fresh = createDatabase();
    globalStore.__nexusGridDb = fresh;
    return fresh;
  }
  return existing;
}

/** Insert a row, assigning the next id for its table. Returns the stored row. */
export function insert<T extends Row>(tbl: Table<T>, data: Omit<T, "id">): T {
  const row = { ...data, id: tbl.nextId++ } as T;
  tbl.rows.push(row);
  return row;
}

/**
 * The Postgres connection, when one is configured.
 *
 * Optional by design: without `DATABASE_URL` everything falls back to the
 * process-local stores it always used, so a laptop, a demo or the test suite
 * still needs nothing installed. With it, the audit trail, agent log, user
 * list and paused runs are shared by every instance and survive restarts —
 * which on Vercel, where each request may land on a different short-lived
 * instance, is the difference between an approval gate that works and one
 * that does not.
 */

import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

/** An arbitrary constant: the advisory lock every instance migrates under. */
const MIGRATION_LOCK_ID = 7_243_116;

const globalDb = globalThis as typeof globalThis & {
  __nexusGridPool?: Pool;
  __nexusGridDrizzle?: Database;
  __nexusGridMigrated?: Promise<void>;
};

export function databaseUrl(): string {
  return process.env.DATABASE_URL?.trim() ?? "";
}

export function databaseConfigured(): boolean {
  return databaseUrl() !== "";
}

/** The shared pool. Small, because serverless instances are many and short-lived. */
export function getPool(): Pool {
  if (!globalDb.__nexusGridPool) {
    const max = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);
    globalDb.__nexusGridPool = new Pool({
      connectionString: databaseUrl(),
      max: Number.isFinite(max) && max > 0 ? max : 5,
      idleTimeoutMillis: 10_000,
    });
    globalDb.__nexusGridPool.on("error", (error) => {
      console.error("Idle Postgres client error", error);
    });
  }
  return globalDb.__nexusGridPool;
}

/**
 * Bring the schema up to date. Every instance calls this on its first query;
 * the advisory lock makes concurrent cold starts queue rather than race, and
 * the migrator skips anything already applied.
 */
export async function migrateDatabase(pool: Pool = getPool()): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    try {
      await migrate(drizzle(client, { schema }), { migrationsFolder: "drizzle" });
    } finally {
      await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
    }
  } finally {
    client.release();
  }
}

/**
 * The database, migrated. Set `DATABASE_AUTO_MIGRATE=0` to manage migrations
 * yourself with `npm run db:migrate` instead.
 */
export async function getDatabase(): Promise<Database> {
  if (!globalDb.__nexusGridMigrated) {
    const auto = process.env.DATABASE_AUTO_MIGRATE !== "0";
    globalDb.__nexusGridMigrated = auto ? migrateDatabase() : Promise.resolve();
    // A failed migration is retried by the next caller, not cached forever.
    globalDb.__nexusGridMigrated.catch(() => {
      globalDb.__nexusGridMigrated = undefined;
    });
  }
  await globalDb.__nexusGridMigrated;
  if (!globalDb.__nexusGridDrizzle) {
    globalDb.__nexusGridDrizzle = drizzle(getPool(), { schema });
  }
  return globalDb.__nexusGridDrizzle;
}

/** Round-trip check for the readiness probe. */
export async function pingDatabase(): Promise<boolean> {
  const db = await getDatabase();
  await db.execute(sql`select 1`);
  return true;
}

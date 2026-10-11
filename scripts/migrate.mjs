#!/usr/bin/env node
// Apply database migrations: the app's tables (drizzle/) and the LangGraph
// checkpointer's own. Safe to run repeatedly and concurrently with app
// instances, which take the same advisory lock when they auto-migrate.
//
//   DATABASE_URL=postgres://… npm run db:migrate
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

// Must match MIGRATION_LOCK_ID in src/lib/server/db/client.ts.
const LOCK = 7_243_116;
const pool = new pg.Pool({ connectionString: url, max: 1 });

try {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK]);
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
    await client.query("select pg_advisory_unlock($1)", [LOCK]);
  } finally {
    client.release();
  }
  await new PostgresSaver(pool).setup();
  console.log("Database is up to date.");
} finally {
  await pool.end();
}

/**
 * Access granted from the console, stored in Postgres.
 *
 * Reads are cached briefly per instance because the role is re-resolved on
 * every request; a change made on one instance clears that instance's cache
 * at once and reaches the others within `CACHE_MS`.
 */

import { asc, eq, sql } from "drizzle-orm";

import { databaseConfigured, getDatabase } from "../db/client";
import { users } from "../db/schema";
import { isRole, type Role, type StoredGrant } from "./policy";

const CACHE_MS = 30_000;

const globalUsers = globalThis as typeof globalThis & {
  __nexusGridUserCache?: Map<string, { grant: StoredGrant | null; at: number }>;
};

function cache() {
  if (!globalUsers.__nexusGridUserCache) globalUsers.__nexusGridUserCache = new Map();
  return globalUsers.__nexusGridUserCache;
}

export interface UserRecord {
  email: string;
  name: string | null;
  role: Role;
  disabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
}

function toRecord(row: typeof users.$inferSelect): UserRecord {
  return {
    email: row.email,
    name: row.name,
    role: isRole(row.role) ? row.role : "viewer",
    disabled: row.disabled,
    created_by: row.createdBy,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    last_sign_in_at: row.lastSignInAt?.toISOString() ?? null,
  };
}

/** The stored grant for an address, or null when there is none (or no database). */
export async function findGrant(email: string | null | undefined): Promise<StoredGrant | null> {
  const address = email?.trim().toLowerCase();
  if (!address || !databaseConfigured()) return null;

  const hit = cache().get(address);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.grant;

  const db = await getDatabase();
  const [row] = await db
    .select({ role: users.role, disabled: users.disabled })
    .from(users)
    .where(eq(users.email, address));
  const grant = row && isRole(row.role) ? { role: row.role, disabled: row.disabled } : null;
  cache().set(address, { grant, at: Date.now() });
  return grant;
}

export async function listUsers(): Promise<UserRecord[]> {
  const db = await getDatabase();
  const rows = await db.select().from(users).orderBy(asc(users.email));
  return rows.map(toRecord);
}

/** Create or change a grant. Returns the stored record. */
export async function upsertUser(
  input: { email: string; name?: string | null; role: Role; disabled?: boolean },
  actor: string
): Promise<UserRecord> {
  const email = input.email.trim().toLowerCase();
  const db = await getDatabase();
  const [row] = await db
    .insert(users)
    .values({
      email,
      name: input.name ?? null,
      role: input.role,
      disabled: input.disabled ?? false,
      createdBy: actor,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        role: input.role,
        disabled: input.disabled ?? false,
        // Keep a name already learned at sign-in unless one is given.
        name: sql`coalesce(${input.name ?? null}, ${users.name})`,
        updatedAt: sql`now()`,
      },
    })
    .returning();
  cache().delete(email);
  return toRecord(row);
}

/** Note a successful sign-in. Only for people who already have a stored grant. */
export async function recordSignIn(email: string, name: string | null | undefined): Promise<void> {
  if (!databaseConfigured()) return;
  const db = await getDatabase();
  await db
    .update(users)
    .set({ lastSignInAt: sql`now()`, name: sql`coalesce(${users.name}, ${name ?? null})` })
    .where(eq(users.email, email.trim().toLowerCase()));
}

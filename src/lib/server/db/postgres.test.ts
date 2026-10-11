/**
 * The Postgres backend, against a real database.
 *
 * Runs when DATABASE_URL is set — CI provides a throwaway Postgres service —
 * and is skipped otherwise, so the suite still needs nothing installed locally.
 */

import { randomUUID } from "node:crypto";

import { Annotation, END, interrupt, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { afterAll, describe, expect, it } from "vitest";

import { findGrant, listUsers, recordSignIn, upsertUser } from "../auth/users";
import { agentActivities, auditLogs, storeKind } from "../observability/repositories";
import { ReadyPostgresSaver } from "../workflows/postgres-checkpointer";
import { getPool, migrateDatabase, pingDatabase } from "./client";

const enabled = Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)("Postgres backend", () => {
  const run = randomUUID().slice(0, 8);

  afterAll(async () => {
    await getPool().end();
  });

  it("migrates idempotently and answers a ping", async () => {
    await migrateDatabase();
    await migrateDatabase();
    expect(await pingDatabase()).toBe(true);
    expect(storeKind()).toBe("postgres");
  });

  it("stores and filters the audit trail, newest first", async () => {
    const actor = `tester-${run}@example.org`;
    const before = await auditLogs.count();
    await auditLogs.create({ actor, action: "a.first", entity_type: "test", entity_id: null, detail: null, created_at: null });
    await auditLogs.create({ actor, action: "a.second", entity_type: "test", entity_id: 7, detail: "x", created_at: "2026-01-02T03:04:05Z" });

    const rows = await auditLogs.list({ actor, limit: 10 });
    expect(rows.map((row) => row.action)).toEqual(["a.second", "a.first"]);
    expect(rows[0]).toMatchObject({ entity_id: 7, detail: "x", created_at: "2026-01-02T03:04:05Z" });
    expect(await auditLogs.count()).toBe(before + 2);
  });

  it("refuses to rewrite or delete audit rows", async () => {
    await expect(getPool().query("update audit_logs set actor = 'someone else'")).rejects.toThrow(/append-only/);
    await expect(getPool().query("delete from audit_logs")).rejects.toThrow(/append-only/);
  });

  it("stores agent activity", async () => {
    const agent = `agent-${run}`;
    await agentActivities.create({ agent_name: agent, action: "scan", confidence: 0.75, context: "{\"a\":1}", created_at: null });
    const [row] = await agentActivities.list({ agent_name: agent });
    expect(row).toMatchObject({ agent_name: agent, action: "scan", confidence: 0.75, context: "{\"a\":1}" });
  });

  it("grants, changes and disables access", async () => {
    const email = `Person-${run}@Coop.tt`;
    const lower = email.toLowerCase();

    expect(await findGrant(lower)).toBeNull();
    await upsertUser({ email, role: "operator" }, "admin@example.org");
    expect(await findGrant(lower)).toEqual({ role: "operator", disabled: false });

    await recordSignIn(lower, "Person");
    await upsertUser({ email: lower, role: "viewer", disabled: true }, "admin@example.org");
    expect(await findGrant(lower)).toEqual({ role: "viewer", disabled: true });

    const record = (await listUsers()).find((user) => user.email === lower);
    expect(record).toMatchObject({ name: "Person", role: "viewer", disabled: true, created_by: "admin@example.org" });
    expect(record?.last_sign_in_at).not.toBeNull();
  });

  it("keeps a paused run across checkpointer instances", async () => {
    const State = Annotation.Root({ decision: Annotation<string | null>() });
    const build = (saver: ReadyPostgresSaver | MemorySaver) =>
      new StateGraph(State)
        .addNode("gate", () => ({ decision: interrupt("decide") as string }))
        .addEdge(START, "gate")
        .addEdge("gate", END)
        .compile({ checkpointer: saver });

    const config = { configurable: { thread_id: `thread-${run}` } };
    await build(new ReadyPostgresSaver(getPool())).invoke({ decision: null }, config);

    // A second instance, as another serverless function would be, sees the pause.
    const other = build(new ReadyPostgresSaver(getPool()));
    const paused = await other.getState(config);
    expect(paused.next).toEqual(["gate"]);
  });
});

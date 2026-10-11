import { api } from "@/lib/server/http";
import { checkpointerKind } from "@/lib/server/workflows/checkpointer";
import {
  agentActivities,
  auditLogs,
  storeKind,
} from "@/lib/server/observability/repositories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Readiness probe.
 *
 * There is no domain database to check — records live in the systems this
 * platform coordinates. What it reports is its own store: Postgres when
 * `DATABASE_URL` is set, process memory otherwise, and where paused runs are
 * checkpointed. A configured database that cannot be reached is a 503, so a
 * deploy that lost its database fails verification instead of serving.
 */
export const GET = api(
  async () => {
    const store = storeKind();
    try {
      const [activities, audits] = await Promise.all([agentActivities.count(), auditLogs.count()]);
      return {
        status: "ok",
        store,
        checkpointer: checkpointerKind(),
        agent_activities: activities,
        audit_logs: audits,
        // With the memory store, the store, source caches, agent memory and
        // checkpointer are all process-local. Surfacing the pid makes it
        // checkable from outside whether requests are landing in one process
        // or several — if this varies across calls, those singletons are not
        // shared. With Postgres the records and paused runs are shared, and
        // only the source caches and agent memory remain per process.
        pid: process.pid,
        uptime_seconds: Math.round(process.uptime()),
      };
    } catch (error) {
      console.error("Readiness check failed", error);
      return Response.json(
        { status: "unavailable", store, detail: "The database could not be reached." },
        { status: 503 }
      );
    }
  },
  // Public: the deploy workflow's verify step probes it unauthenticated.
  { access: "public" }
);

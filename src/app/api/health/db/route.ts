import { api } from "@/lib/server/http";
import { agentActivities, auditLogs } from "@/lib/server/repositories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Readiness probe.
 *
 * There is no domain database to check — records live in the systems this
 * platform coordinates. What it reports is its own observability store.
 */
export const GET = api(() => {
  try {
    return {
      status: "ok",
      store: "in-memory (observability only)",
      agent_activities: agentActivities.count(),
      audit_logs: auditLogs.count(),
      // The store, source caches, agent memory, and workflow checkpointer are
      // all process-local. Surfacing the pid makes it checkable from outside
      // whether requests are landing in one process or several — if this value
      // varies across calls, those singletons are not shared and none of them
      // can be trusted.
      pid: process.pid,
      uptime_seconds: Math.round(process.uptime()),
    };
  } catch (error) {
    return {
      status: "degraded",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
});

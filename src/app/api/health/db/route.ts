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
    };
  } catch (error) {
    return {
      status: "degraded",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
});

import { actionLabel, agentTitle } from "@/lib/server/agents/labels";
import { api } from "@/lib/server/http";
import {
  analyseCached,
  ANALYSIS_DOMAINS,
  type AnalysisInputs,
} from "@/lib/server/interpretation/analysis";
import { dispatchReadiness } from "@/lib/server/dispatch/openclaw";
import { recentCoordination } from "@/lib/server/observability/coordination";
import { buildLanes } from "@/lib/server/lanes";
import { listAgentActivities, listAuditLogs } from "@/lib/server/observability/activity";
import { buildRegionalPicture } from "@/lib/server/projection";
import { bundleProvenance, fetchAllSources } from "@/lib/server/sources";
import { utcnowIso } from "@/lib/server/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every domain's reading at once, plus the platform's own decision record.
 *
 * The impact page charts what the agents concluded, so it needs all five
 * readings together — severity across domains, confidence across findings —
 * and fetching them one endpoint at a time would make the page's shape depend
 * on request ordering. Each domain is still individually cached, so this is
 * five cache reads and no extra model calls once they are warm.
 */
export const GET = api(async () => {
  const bundle = await fetchAllSources(false);
  const picture = buildRegionalPicture(bundle);
  const { lanes, ports, matches } = buildLanes(picture);

  const activities = listAgentActivities({ limit: 500 });
  const audits = listAuditLogs({ limit: 500 });

  const inputs: AnalysisInputs = {
    // What the loop has concluded, so a reading builds on the decisions
    // already taken rather than describing a gap as untouched.
    coordination: recentCoordination(),
    picture,
    lanes,
    ports,
    matches,
    decisions: activities.map((a) => ({
      agent: agentTitle(a.agent_name),
      action: actionLabel(a.action),
      confidence: a.confidence ?? null,
    })),
    gateOutcomes: audits
      .filter((log) => log.action.startsWith("workflow.gate_"))
      .reduce<Record<string, number>>((acc, log) => {
        const decision = log.action.replace("workflow.gate_", "");
        acc[decision] = (acc[decision] ?? 0) + 1;
        return acc;
      }, {}),
  };

  const analyses = await Promise.all(
    ANALYSIS_DOMAINS.map((domain) => analyseCached(domain, inputs))
  );

  return {
    analyses,
    // The platform's own two tables, already in readable form.
    decisions: activities.map((activity) => ({
      id: activity.id,
      agent: agentTitle(activity.agent_name),
      action: actionLabel(activity.action),
      confidence: activity.confidence ?? null,
      created_at: activity.created_at ?? null,
    })),
    gate_decisions: audits
      .filter((log) => log.action.startsWith("workflow.gate_"))
      .map((log) => ({
        id: log.id,
        decision: log.action.replace("workflow.gate_", ""),
        note: log.detail ?? null,
        actor: log.actor,
        created_at: log.created_at ?? null,
      })),
    /** Ranked supplier shortlists — agent-derived scores worth charting. */
    matches,
    /** Whether an approved plan has anywhere to go, and what is missing. */
    dispatch: dispatchReadiness(),
    sources: bundleProvenance(bundle),
    generated_at: utcnowIso(),
  };
});

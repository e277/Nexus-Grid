import { actionLabel, agentTitle } from "@/lib/server/agents/labels";
import { api, boolQuery, HttpError } from "@/lib/server/http";
import {
  analyseCached,
  ANALYSIS_DOMAINS,
  type AnalysisDomain,
  type AnalysisInputs,
} from "@/lib/server/interpretation/analysis";
import { buildLanes } from "@/lib/server/lanes";
import { listAgentActivities, listAuditLogs } from "@/lib/server/observability/activity";
import { buildRegionalPicture } from "@/lib/server/projection";
import { bundleProvenance, fetchAllSources } from "@/lib/server/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One agent's reading of one domain.
 *
 * The page this serves renders findings, not figures — the numbers appear only
 * as the evidence each finding cites. Provenance still travels with it, so a
 * reader can see which publishers the agent was working from and whether any
 * of them were down when it read.
 */
export const GET = api<{ domain: string }>(async ({ params, query }) => {
  const domain = params.domain as AnalysisDomain;
  if (!ANALYSIS_DOMAINS.includes(domain)) {
    throw new HttpError(404, `Unknown analysis domain: ${params.domain}`);
  }

  const bundle = await fetchAllSources(false);
  const picture = buildRegionalPicture(bundle);

  const inputs: AnalysisInputs = { picture };

  // Only the domains that need them pay for the extra derivations.
  if (domain === "logistics") {
    const { lanes, ports, matches } = buildLanes(picture);
    inputs.lanes = lanes;
    inputs.ports = ports;
    inputs.matches = matches;
  }

  if (domain === "impact") {
    // Readable names, not identifiers: this goes into a prompt, and an
    // analyst handed `supply_intelligence: no_material_gap` quotes it back.
    inputs.decisions = listAgentActivities({ limit: 200 }).map((a) => ({
      agent: agentTitle(a.agent_name),
      action: actionLabel(a.action),
      confidence: a.confidence ?? null,
    }));
    inputs.gateOutcomes = listAuditLogs({ limit: 200 })
      .filter((log) => log.action.startsWith("workflow.gate_"))
      .reduce<Record<string, number>>((acc, log) => {
        const decision = log.action.replace("workflow.gate_", "");
        acc[decision] = (acc[decision] ?? 0) + 1;
        return acc;
      }, {});
  }

  return {
    analysis: await analyseCached(domain, inputs, boolQuery(query, "refresh") ?? false),
    sources: bundleProvenance(bundle),
  };
});

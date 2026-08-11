import { api, boolQuery } from "@/lib/server/http";
import { interpret } from "@/lib/server/interpretation/signals";
import { buildRegionalPicture } from "@/lib/server/projection";
import { bundleProvenance, fetchAllSources } from "@/lib/server/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Coordination signals: the regional picture put through the interpretation
 * layer. Falls back to deterministic rule-derived signals, clearly labelled,
 * when no model is configured or the call fails.
 */
export const GET = api(async ({ query }) => {
  const bundle = await fetchAllSources(boolQuery(query, "refresh") ?? false);
  const picture = buildRegionalPicture(bundle);

  return {
    ...(await interpret(picture)),
    sources: bundleProvenance(bundle),
    totals: picture.totals,
  };
});

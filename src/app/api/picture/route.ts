import { api, boolQuery } from "@/lib/server/http";
import { buildRegionalPicture } from "@/lib/server/projection";
import { bundleProvenance, fetchAllSources } from "@/lib/server/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The regional picture: every figure here is derived from the current
 * snapshots, and the provenance that produced it travels with it.
 */
export const GET = api(async ({ query }) => {
  const bundle = await fetchAllSources(boolQuery(query, "refresh") ?? false);
  return {
    picture: buildRegionalPicture(bundle),
    sources: bundleProvenance(bundle),
  };
});

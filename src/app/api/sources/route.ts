import { api, boolQuery } from "@/lib/server/http";
import { bundleProvenance, fetchAllSources } from "@/lib/server/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What this platform is reading, where each input came from, and how fresh it
 * is. Provenance is a first-class response here, not a footnote.
 */
export const GET = api(async ({ query }) => {
  const bundle = await fetchAllSources(boolQuery(query, "refresh") ?? false);
  const sources = bundleProvenance(bundle);

  return {
    sources,
    summary: {
      total: sources.length,
      live: sources.filter((s) => s.status === "live").length,
      degraded: sources.filter((s) => s.status !== "live").length,
      records: sources.reduce((total, s) => total + s.records, 0),
    },
  };
});

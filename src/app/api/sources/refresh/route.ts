import { api } from "@/lib/server/http";
import { bundleProvenance, fetchAllSources } from "@/lib/server/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Refetch every upstream source, bypassing the cache. */
export const POST = api(async () => {
  const bundle = await fetchAllSources(true);
  return { status: "refreshed", sources: bundleProvenance(bundle) };
});

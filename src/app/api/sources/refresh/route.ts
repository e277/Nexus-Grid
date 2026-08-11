import { api } from "@/lib/server/http";
import { bundleProvenance, fetchAllSources } from "@/lib/server/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Kick off a refetch of every upstream source.
 *
 * Returns immediately rather than awaiting the network: a full refresh is over
 * a minute of deliberately rate-limited requests, and no button press should
 * hang for that. The console polls, and statuses move to `live` as each
 * publisher answers.
 */
export const POST = api(async () => {
  void fetchAllSources(true).catch((error) => {
    console.error("Source refresh failed", error);
  });

  // Current state, so the caller can show what is about to be replaced.
  const bundle = await fetchAllSources(false);
  return { status: "refreshing", sources: bundleProvenance(bundle) };
});

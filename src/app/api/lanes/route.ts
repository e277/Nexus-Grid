import { api } from "@/lib/server/http";
import { buildLanes } from "@/lib/server/lanes";
import { buildRegionalPicture } from "@/lib/server/projection";
import { bundleProvenance, fetchAllSources } from "@/lib/server/sources";
import { utcnowIso } from "@/lib/server/time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Supplier→importer lanes behind the substitution opportunities, with the
 * live climate risk at each end and an explicit list of what is not observed.
 */
export const GET = api(async () => {
  const bundle = await fetchAllSources(false);
  const picture = buildRegionalPicture(bundle);
  const { lanes, ports, matches, unobserved } = buildLanes(picture);

  return {
    lanes,
    ports,
    matches,
    active_storms: picture.climate.active_storms,
    unobserved,
    sources: bundleProvenance(bundle),
    generated_at: utcnowIso(),
  };
});

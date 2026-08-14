import { api } from "@/lib/server/http";
import { PRODUCTION_SERIES, summariseProduction } from "@/lib/server/production";
import { fetchAllSources } from "@/lib/server/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Production over time, per member state.
 *
 * The World Bank indicators are fetched as a full series from 2015 and the
 * regional projection keeps only the latest value of each. This exposes the
 * series itself, and a direction across it computed in `production.ts` rather
 * than asked of a model: it is arithmetic, and a model asked to eyeball a
 * trend will sometimes assert one that is not in the numbers.
 */
export const GET = api(async () => {
  const bundle = await fetchAllSources(false);
  const production = summariseProduction(bundle.indicators.records ?? []);

  return {
    production,
    provenance: {
      publisher: "World Bank Open Data",
      documentation: "https://data.worldbank.org/indicator",
      indicators: Object.values(PRODUCTION_SERIES),
      note: "Observed annual series, not a projection.",
    },
  };
});

/**
 * The source registry: one call that gathers every upstream snapshot.
 *
 * Sources are fetched concurrently and independently — one unavailable
 * publisher degrades its own slice of the picture and nothing else, which is
 * the property that lets this run against systems it does not control.
 */

import { fetchClimate, fetchStorms } from "./climate";
import { fetchComtrade } from "./comtrade";
import { fetchFaostat } from "./faostat";
import { fetchWorldBank } from "./world-bank";
import type {
  ClimateSignal,
  Observation,
  Provenance,
  Snapshot,
  StormSignal,
  TradeFlow,
} from "./types";

export interface SourceBundle {
  indicators: Snapshot<Observation>;
  trade: Snapshot<TradeFlow>;
  production: Snapshot<Observation>;
  climate: Snapshot<ClimateSignal>;
  storms: Snapshot<StormSignal>;
}

/** Fetch every source. `force` bypasses the cache and refetches. */
export async function fetchAllSources(force = false): Promise<SourceBundle> {
  const [indicators, trade, production, climate, storms] = await Promise.all([
    fetchWorldBank(force),
    fetchComtrade(force),
    fetchFaostat(force),
    fetchClimate(force),
    fetchStorms(force),
  ]);
  return { indicators, trade, production, climate, storms };
}

/** Provenance for every source, for the freshness panel. */
export function bundleProvenance(bundle: SourceBundle): (Provenance & { records: number })[] {
  return Object.values(bundle).map((snapshot) => ({
    ...snapshot.provenance,
    records: snapshot.records.length,
  }));
}

export { fetchClimate, fetchComtrade, fetchFaostat, fetchStorms, fetchWorldBank };
export * from "./types";
export { CARICOM_STATES, byIso3, byName } from "./caricom";
export { clearCache } from "./cache";

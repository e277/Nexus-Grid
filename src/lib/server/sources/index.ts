/**
 * The source registry: one call that gathers every upstream snapshot.
 *
 * Sources are fetched concurrently and independently — one unavailable
 * publisher degrades its own slice of the picture and nothing else, which is
 * the property that lets this run against systems it does not control.
 */

import { fetchAgroclimate } from "./agroclimate";
import { fetchClimate, fetchStorms } from "./climate";
import { fetchComtrade } from "./comtrade";
import { fetchSoil } from "./soil";
import { fetchWorldBank } from "./world-bank";
import type {
  ClimateSignal,
  MonthlyClimate,
  Observation,
  Provenance,
  Snapshot,
  SoilProfile,
  StormSignal,
  TradeFlow,
} from "./types";

export interface SourceBundle {
  indicators: Snapshot<Observation>;
  trade: Snapshot<TradeFlow>;
  climate: Snapshot<ClimateSignal>;
  storms: Snapshot<StormSignal>;
  soil: Snapshot<SoilProfile>;
  agroclimate: Snapshot<MonthlyClimate>;
}

/** Fetch every source. `force` bypasses the cache and refetches. */
export async function fetchAllSources(force = false): Promise<SourceBundle> {
  const [indicators, trade, climate, storms, soil, agroclimate] = await Promise.all([
    fetchWorldBank(force),
    fetchComtrade(force),
    fetchClimate(force),
    fetchStorms(force),
    fetchSoil(force),
    fetchAgroclimate(force),
  ]);
  return { indicators, trade, climate, storms, soil, agroclimate };
}

/** Provenance for every source, for the freshness panel. */
export function bundleProvenance(bundle: SourceBundle): (Provenance & { records: number })[] {
  return Object.values(bundle).map((snapshot) => ({
    ...snapshot.provenance,
    records: snapshot.records.length,
  }));
}

export { fetchAgroclimate, fetchClimate, fetchComtrade, fetchSoil, fetchStorms, fetchWorldBank };
export * from "./types";
export { CARICOM_STATES, byIso3, byName } from "./caricom";
export { clearCache } from "./cache";

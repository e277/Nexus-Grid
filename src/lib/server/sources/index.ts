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
import { provenance } from "./types";
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

/** An unreachable source becomes a reportable status, never a thrown error. */
async function settled<T>(
  label: string,
  fetching: Promise<Snapshot<T>>
): Promise<Snapshot<T>> {
  try {
    return await fetching;
  } catch (error) {
    console.error(`Source ${label} threw`, error);
    return {
      records: [],
      provenance: provenance("world-bank", label, "", "unavailable", {
        note: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

/**
 * Fetch every source. `force` bypasses the cache and refetches.
 *
 * Never rejects: the whole point of the layer is that one unavailable
 * publisher degrades its own slice and nothing else. A `Promise.all` here
 * meant a single failure took down the bundle and surfaced as a 500.
 */
export async function fetchAllSources(force = false): Promise<SourceBundle> {
  const [indicators, trade, climate, storms, soil, agroclimate] = await Promise.all([
    settled("World Bank Open Data", fetchWorldBank(force)),
    settled("UN Comtrade (public preview)", fetchComtrade(force)),
    settled("Open-Meteo", fetchClimate(force)),
    settled("NOAA National Hurricane Center", fetchStorms(force)),
    settled("ISRIC SoilGrids", fetchSoil(force)),
    settled("NASA POWER (agroclimatology)", fetchAgroclimate(force)),
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

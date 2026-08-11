/**
 * SoilGrids (ISRIC) — soil properties under each member state's main growing
 * area. Free, keyless, global 250m coverage.
 *
 * SoilGrids allows roughly five calls a minute and answers 503 past that, so
 * this cannot sweep fifteen states in one pass. Instead each state is cached
 * independently for a month — soil does not move — and every refresh tops up a
 * few states that are missing, generously spaced. The picture fills in over
 * the first few refreshes and then stays filled, and the source reports how
 * many states it still owes rather than implying it has them all.
 *
 * The grid also genuinely has no data over some pixels (open water, bare rock,
 * dense urban) and answers those with `null`. Those are recorded as an explicit
 * "no coverage" rather than a fabricated number — a soil reading is exactly the
 * kind of value someone would plan a planting season around.
 */

import { CARICOM_STATES, type CaricomState } from "./caricom";
import { fetchJson } from "./cache";
import { provenance, type Snapshot, type SoilProfile } from "./types";

const ENDPOINT = "https://rest.isric.org/soilgrids/v2.0/properties/query";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEPTH = "0-5cm";

/** Documented limit is ~5 requests/minute; stay comfortably under it. */
const GAP_MS = 13_000;
/** States to top up per refresh, so a single call never blocks for minutes. */
const BUDGET = 3;

/** pH, organic carbon, clay and sand — enough to speak to crop suitability. */
const PROPERTIES = ["phh2o", "soc", "clay", "sand"] as const;

interface SoilGridsResponse {
  properties: {
    layers: {
      name: string;
      unit_measure: { d_factor: number; target_units: string };
      depths: { label: string; values: { mean: number | null } }[];
    }[];
  };
}

/** How long to skip a state whose last fetch errored, before trying again. */
const RETRY_AFTER_MS = 10 * 60 * 1000;

interface CachedProfile {
  /** Null records a failed attempt, so one bad point cannot block the rest. */
  profile: SoilProfile | null;
  expiresAt: number;
}

const globalSoil = globalThis as typeof globalThis & {
  __nexusGridSoil?: Map<string, CachedProfile>;
};

function store(): Map<string, CachedProfile> {
  if (!globalSoil.__nexusGridSoil) globalSoil.__nexusGridSoil = new Map();
  return globalSoil.__nexusGridSoil;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Plain-language read on what the soil suits, from pH and texture.
 *
 * Deliberately conservative: this is a starting point for an agronomist, not a
 * recommendation on its own, and the phrasing says so.
 */
function suitability(ph: number | null, clayPct: number | null, socGkg: number | null): string {
  if (ph === null) return "No soil coverage at this point.";

  const notes: string[] = [];
  if (ph < 5.5) notes.push("acidic — liming likely needed for cereals and legumes");
  else if (ph > 7.5) notes.push("alkaline — may limit micronutrient uptake");
  else notes.push("pH in the workable range for most field crops");

  if (clayPct !== null) {
    if (clayPct > 40) notes.push("heavy clay: holds water, drains slowly, suits rice and pasture");
    else if (clayPct < 20) notes.push("light texture: drains fast, suits roots and tubers");
    else notes.push("balanced texture");
  }

  if (socGkg !== null && socGkg > 30) notes.push("high organic carbon");
  else if (socGkg !== null && socGkg < 10) notes.push("low organic carbon — fertility building needed");

  return notes.join("; ");
}

async function fetchState(state: CaricomState): Promise<SoilProfile> {
  const params = new URLSearchParams({
    lon: String(state.farmland[1]),
    lat: String(state.farmland[0]),
    depth: DEPTH,
    value: "mean",
  });
  for (const property of PROPERTIES) params.append("property", property);

  const payload = (await fetchJson(`${ENDPOINT}?${params}`, 25_000)) as SoilGridsResponse;

  const readings: Record<string, number | null> = {};
  for (const layer of payload.properties.layers) {
    const raw = layer.depths.find((d) => d.label === DEPTH)?.values.mean ?? null;
    const factor = layer.unit_measure?.d_factor || 1;
    readings[layer.name] = raw === null ? null : Math.round((raw / factor) * 10) / 10;
  }

  const ph = readings.phh2o ?? null;
  const clay = readings.clay ?? null;

  return {
    country_iso3: state.iso3,
    country: state.name,
    latitude: state.farmland[0],
    longitude: state.farmland[1],
    ph,
    organic_carbon_g_per_kg: readings.soc ?? null,
    clay_pct: clay,
    sand_pct: readings.sand ?? null,
    has_coverage: ph !== null,
    suitability: suitability(ph, clay, readings.soc ?? null),
  };
}

export async function fetchSoil(force = false): Promise<Snapshot<SoilProfile>> {
  const cache = store();
  if (force) cache.clear();

  const now = Date.now();
  const missing = CARICOM_STATES.filter((state) => {
    const entry = cache.get(state.iso3);
    return !entry || entry.expiresAt <= now;
  });

  let failures = 0;
  const attempts = missing.slice(0, BUDGET);

  for (const [index, state] of attempts.entries()) {
    if (index > 0) await sleep(GAP_MS);
    try {
      const profile = await fetchState(state);
      cache.set(state.iso3, { profile, expiresAt: Date.now() + CACHE_TTL_MS });
    } catch (error) {
      // Record the failure with a short expiry and move on. Retrying the same
      // state first on every pass would let one bad point block every state
      // behind it indefinitely.
      failures += 1;
      cache.set(state.iso3, { profile: null, expiresAt: Date.now() + RETRY_AFTER_MS });
      console.warn(`SoilGrids failed for ${state.iso3}:`, error);
    }
  }

  const records = CARICOM_STATES.map((state) => cache.get(state.iso3)?.profile).filter(
    (profile): profile is SoilProfile => profile !== null && profile !== undefined
  );

  const covered = records.filter((r) => r.has_coverage).length;
  const sampled = CARICOM_STATES.filter((state) => {
    const entry = cache.get(state.iso3);
    return entry !== undefined && entry.profile !== null;
  }).length;
  const outstanding = CARICOM_STATES.length - sampled;
  const uncovered = records.filter((r) => !r.has_coverage).map((r) => r.country_iso3);

  const notes: string[] = [];
  if (outstanding > 0) {
    notes.push(
      `${outstanding} state(s) not yet sampled — SoilGrids allows ~5 calls/minute, so the ` +
        `remainder fill in over the next refreshes.`
    );
  }
  if (failures > 0) notes.push(`${failures} request(s) failed this pass and will retry.`);
  if (uncovered.length > 0) {
    notes.push(`Grid has no data at the sampled point for ${uncovered.join(", ")}.`);
  }

  return {
    records,
    provenance: provenance(
      "soil",
      "ISRIC SoilGrids",
      ENDPOINT,
      records.length === 0 ? "unavailable" : covered > 0 ? "live" : "empty",
      {
        covers: `${DEPTH} depth · ${covered}/${CARICOM_STATES.length} states sampled with coverage`,
        note: notes.length > 0 ? notes.join(" ") : undefined,
      }
    ),
  };
}

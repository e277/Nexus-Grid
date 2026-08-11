/**
 * NASA POWER agroclimatology — the long-run monthly climate of each member
 * state's growing area. Free, keyless.
 *
 * This is what makes planting coordination possible: rainfall, temperature and
 * solar radiation by month, from the same model for every state, so planting
 * windows on one island can actually be compared with another's instead of
 * each ministry reading its own records.
 *
 * Climatology, not forecast — it answers "when is this place normally plantable",
 * which is the question a planting calendar asks. Live conditions come from the
 * climate source.
 */

import { CARICOM_STATES } from "./caricom";
import { fetchJson, withCache } from "./cache";
import { provenance, type MonthlyClimate, type PlantingWindow, type Snapshot } from "./types";

const ENDPOINT = "https://power.larc.nasa.gov/api/temporal/climatology/point";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // a climate normal, not a forecast
const GAP_MS = 700;

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
] as const;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Rain thresholds for a rain-fed planting window, mm/day.
 *
 * Below the floor a crop needs irrigation to establish; above the ceiling,
 * fields waterlog and disease pressure climbs. Between them a season can be
 * started on rainfall alone.
 */
const RAIN_FLOOR_MM_DAY = 2.5;
const RAIN_CEILING_MM_DAY = 9.0;

interface PowerResponse {
  properties: {
    parameter: {
      T2M: Record<string, number>;
      PRECTOTCORR: Record<string, number>;
      ALLSKY_SFC_SW_DWN: Record<string, number>;
    };
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function classifyMonth(rainMmDay: number): PlantingWindow["suitability"] {
  if (rainMmDay < RAIN_FLOOR_MM_DAY) return "irrigation_required";
  if (rainMmDay > RAIN_CEILING_MM_DAY) return "too_wet";
  return "rain_fed";
}

async function fetchState(
  iso3: string,
  name: string,
  farmland: readonly [number, number]
): Promise<MonthlyClimate> {
  const params = new URLSearchParams({
    parameters: "T2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN",
    community: "AG",
    latitude: String(farmland[0]),
    longitude: String(farmland[1]),
    format: "JSON",
  });

  const payload = (await fetchJson(`${ENDPOINT}?${params}`, 25_000)) as PowerResponse;
  const { T2M, PRECTOTCORR, ALLSKY_SFC_SW_DWN } = payload.properties.parameter;

  const months: PlantingWindow[] = MONTHS.map((key, index) => {
    const rain = PRECTOTCORR[key];
    return {
      month: index + 1,
      month_name: MONTH_NAMES[index],
      mean_temp_c: Math.round(T2M[key] * 10) / 10,
      mean_rain_mm_day: Math.round(rain * 100) / 100,
      solar_kwh_m2_day: Math.round(ALLSKY_SFC_SW_DWN[key] * 100) / 100,
      suitability: classifyMonth(rain),
    };
  });

  const rainFed = months.filter((m) => m.suitability === "rain_fed").map((m) => m.month_name);

  return {
    country_iso3: iso3,
    country: name,
    months,
    rain_fed_months: rainFed,
    wettest_month: months.reduce((a, b) => (b.mean_rain_mm_day > a.mean_rain_mm_day ? b : a))
      .month_name,
    driest_month: months.reduce((a, b) => (b.mean_rain_mm_day < a.mean_rain_mm_day ? b : a))
      .month_name,
  };
}

export function fetchAgroclimate(force = false): Promise<Snapshot<MonthlyClimate>> {
  return withCache<MonthlyClimate>(
    "agroclimate",
    CACHE_TTL_MS,
    async () => {
      const records: MonthlyClimate[] = [];
      const failed: string[] = [];

      for (const [index, state] of CARICOM_STATES.entries()) {
        if (index > 0) await sleep(GAP_MS);
        try {
          records.push(await fetchState(state.iso3, state.name, state.farmland));
        } catch (error) {
          failed.push(state.iso3);
          console.warn(`NASA POWER failed for ${state.iso3}:`, error);
        }
      }

      return {
        records,
        provenance: provenance(
          "agroclimate",
          "NASA POWER (agroclimatology)",
          ENDPOINT,
          records.length > 0 ? "live" : "unavailable",
          {
            covers: "monthly climate normals",
            note: failed.length > 0 ? `No response for ${failed.join(", ")}.` : undefined,
          }
        ),
      };
    },
    {
      force,
      pending: {
        source: "agroclimate",
        publisher: "NASA POWER (agroclimatology)",
        endpoint: ENDPOINT,
      },
    }
  );
}

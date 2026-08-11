/**
 * Live climate signal for the region: per-island outlook from Open-Meteo and
 * active named storms from NOAA's National Hurricane Center.
 *
 * Both are free and keyless. Islands are fetched concurrently and cached for
 * half an hour — short enough to matter during a developing storm, long
 * enough not to hammer a public API on every dashboard poll.
 */

import { CARICOM_STATES } from "./caricom";
import { fetchJson, withCache } from "./cache";
import {
  provenance,
  type ClimateSignal,
  type Snapshot,
  type StormSignal,
} from "./types";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const STORMS_URL = "https://www.nhc.noaa.gov/CurrentStorms.json";
const CACHE_TTL_MS = 30 * 60 * 1000;
const BATCH_SIZE = 4;
const BATCH_GAP_MS = 600;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function classifyRisk(maxWindKmh: number, maxPrecipPct: number): ClimateSignal["risk"] {
  if (maxWindKmh >= 60 || maxPrecipPct >= 85) return "high";
  if (maxWindKmh >= 35 || maxPrecipPct >= 60) return "medium";
  return "low";
}

interface OpenMeteoResponse {
  daily: {
    windspeed_10m_max: number[];
    precipitation_probability_max: number[];
    precipitation_sum: number[];
  };
  hourly: { soil_moisture_0_to_7cm: (number | null)[] };
}

/**
 * Read topsoil moisture and the coming week's rain as a planting verdict.
 *
 * Static soil properties say what the ground *is*; these say whether it is
 * workable this week, which is the difference between a soil map and a
 * planting decision.
 */
function growingConditions(soilMoisturePct: number | null, weeklyRainMm: number | null): string {
  if (soilMoisturePct === null) return "No soil moisture reading available.";

  if (soilMoisturePct < 15) {
    return `Topsoil dry at ${soilMoisturePct}% — irrigation needed to establish a crop`;
  }
  if (soilMoisturePct > 40) {
    return `Topsoil saturated at ${soilMoisturePct}% — fieldwork likely delayed${
      weeklyRainMm !== null && weeklyRainMm > 50 ? `, ${weeklyRainMm}mm more rain forecast` : ""
    }`;
  }
  return `Topsoil workable at ${soilMoisturePct}%${
    weeklyRainMm !== null ? `, ${weeklyRainMm}mm rain forecast this week` : ""
  }`;
}

export function fetchClimate(force = false): Promise<Snapshot<ClimateSignal>> {
  return withCache<ClimateSignal>(
    "climate",
    CACHE_TTL_MS,
    async () => {
      // Open-Meteo throttles a 15-way fan-out, so islands go out in small
      // batches — still quick, and it actually comes back complete.
      const records: ClimateSignal[] = [];
      let failed = 0;

      for (let i = 0; i < CARICOM_STATES.length; i += BATCH_SIZE) {
        if (i > 0) await sleep(BATCH_GAP_MS);
        const batch = CARICOM_STATES.slice(i, i + BATCH_SIZE);

        const results = await Promise.allSettled(
          batch.map(async (state): Promise<ClimateSignal> => {
            const params = new URLSearchParams({
              latitude: String(state.coordinates[0]),
              longitude: String(state.coordinates[1]),
              daily: "precipitation_probability_max,windspeed_10m_max,precipitation_sum",
              hourly: "soil_moisture_0_to_7cm",
              forecast_days: "7",
              timezone: "auto",
            });
            const { daily, hourly } = (await fetchJson(
              `${FORECAST_URL}?${params}`,
              8000
            )) as OpenMeteoResponse;

            // Risk still reads the first 3 days; the extra days feed the
            // weekly rainfall total the planting verdict uses.
            const maxWind = Math.max(...daily.windspeed_10m_max.slice(0, 3));
            const maxPrecip = Math.max(...daily.precipitation_probability_max.slice(0, 3));
            const risk = classifyRisk(maxWind, maxPrecip);

            const moistureReadings = (hourly?.soil_moisture_0_to_7cm ?? [])
              .slice(0, 24)
              .filter((v): v is number => typeof v === "number");
            const soilMoisturePct =
              moistureReadings.length > 0
                ? Math.round(
                    (moistureReadings.reduce((a, b) => a + b, 0) / moistureReadings.length) * 100
                  )
                : null;
            const weeklyRainMm =
              daily.precipitation_sum?.length > 0
                ? Math.round(
                    daily.precipitation_sum.filter((v) => v != null).reduce((a, b) => a + b, 0) * 10
                  ) / 10
                : null;

            return {
              island: state.name,
              country_iso3: state.iso3,
              risk,
              summary: `${risk} risk — up to ${maxWind.toFixed(0)}km/h wind, ${maxPrecip.toFixed(0)}% precipitation chance over 3 days`,
              max_windspeed_kmh: maxWind,
              max_precipitation_probability_pct: maxPrecip,
              soil_moisture_pct: soilMoisturePct,
              weekly_rainfall_mm: weeklyRainMm,
              growing_conditions: growingConditions(soilMoisturePct, weeklyRainMm),
            };
          })
        );

        for (const result of results) {
          if (result.status === "fulfilled") records.push(result.value);
          else failed += 1;
        }
      }

      return {
        records,
        provenance: provenance(
          "climate",
          "Open-Meteo",
          FORECAST_URL,
          records.length > 0 ? "live" : "unavailable",
          {
            covers: "next 7 days · risk from first 3",
            note: failed > 0 ? `${failed} island(s) did not respond.` : undefined,
          }
        ),
      };
    },
    { force }
  );
}

interface NhcStorm {
  name?: string;
  classification?: string;
  latitudeNumeric?: number;
  longitudeNumeric?: number;
  movementDir?: string;
  intensity?: number;
}

/** Active named storms. An empty list is a real answer, not a placeholder. */
export function fetchStorms(force = false): Promise<Snapshot<StormSignal>> {
  return withCache<StormSignal>(
    "storms",
    CACHE_TTL_MS,
    async () => {
      try {
        const payload = (await fetchJson(STORMS_URL, 8000)) as {
          activeStorms?: NhcStorm[];
        };
        const records: StormSignal[] = (payload.activeStorms ?? []).map((storm) => ({
          name: storm.name ?? "Unnamed",
          classification: storm.classification ?? "unknown",
          latitude: storm.latitudeNumeric ?? null,
          longitude: storm.longitudeNumeric ?? null,
          intensity_kt: storm.intensity ?? null,
          movement: storm.movementDir ?? null,
        }));

        return {
          records,
          provenance: provenance(
            "climate",
            "NOAA National Hurricane Center",
            STORMS_URL,
            "live",
            {
              covers: "current",
              note: records.length === 0 ? "No active storms in the basin." : undefined,
            }
          ),
        };
      } catch (error) {
        return {
          records: [],
          provenance: provenance(
            "climate",
            "NOAA National Hurricane Center",
            STORMS_URL,
            "unavailable",
            { note: error instanceof Error ? error.message : String(error) }
          ),
        };
      }
    },
    { force }
  );
}

/**
 * Live weather provider — real data, no API key required.
 *
 * - `getForecast`: Open-Meteo (api.open-meteo.com), a free keyless forecast
 *   API. Risk is derived from real max windspeed / precipitation-probability
 *   thresholds for the island's coordinates.
 * - `getActiveAlerts`: NOAA's National Hurricane Center current-storms feed
 *   (nhc.noaa.gov/CurrentStorms.json), the same authority named in this
 *   project's own architecture doc. An empty list is a real "no active
 *   storms" answer, not a placeholder.
 *
 * Both calls use a short timeout and fall back to the stub provider on any
 * failure (network, timeout, unrecognized island) — callers always get a
 * usable response, honestly labeled by `source`.
 */

import { utcnowIso } from "../time";
import { lookupIsland } from "./geo";
import type { WeatherAlert, WeatherForecast, WeatherProvider } from "./interfaces";
import { StubWeatherProvider } from "./stubs";

const TIMEOUT_MS = 4000;
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const STORMS_URL = "https://www.nhc.noaa.gov/CurrentStorms.json";

const fallback = new StubWeatherProvider();

function classifyRisk(maxWindKmh: number, maxPrecipPct: number): "low" | "medium" | "high" {
  if (maxWindKmh >= 60 || maxPrecipPct >= 85) return "high";
  if (maxWindKmh >= 35 || maxPrecipPct >= 60) return "medium";
  return "low";
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.json();
}

interface OpenMeteoResponse {
  daily: {
    windspeed_10m_max: number[];
    precipitation_probability_max: number[];
  };
}

interface NhcStorm {
  name?: string;
  classification?: string;
  latitudeNumeric?: number;
  longitudeNumeric?: number;
  movementDir?: string;
  intensity?: number;
}

export class OpenMeteoWeatherProvider implements WeatherProvider {
  async getForecast(island: string): Promise<WeatherForecast> {
    const coords = lookupIsland(island);
    if (coords === null) {
      console.info(`No coordinates for island ${island}; falling back to stub weather`);
      return fallback.getForecast(island);
    }

    try {
      const params = new URLSearchParams({
        latitude: String(coords[0]),
        longitude: String(coords[1]),
        daily: "precipitation_probability_max,windspeed_10m_max",
        forecast_days: "3",
        timezone: "auto",
      });
      const { daily } = (await fetchJson(`${FORECAST_URL}?${params}`)) as OpenMeteoResponse;
      const maxWind = Math.max(...daily.windspeed_10m_max);
      const maxPrecip = Math.max(...daily.precipitation_probability_max);
      const risk = classifyRisk(maxWind, maxPrecip);
      return {
        source: "open-meteo",
        island,
        risk,
        summary: `${risk} storm risk — up to ${maxWind.toFixed(0)}km/h wind, ${maxPrecip.toFixed(0)}% precipitation chance over the next 3 days`,
        max_windspeed_kmh: maxWind,
        max_precipitation_probability_pct: maxPrecip,
        observed_at: utcnowIso(),
      };
    } catch (error) {
      console.warn(`Open-Meteo forecast failed for ${island}:`, error);
      return fallback.getForecast(island);
    }
  }

  async getActiveAlerts(): Promise<WeatherAlert[]> {
    try {
      const payload = (await fetchJson(STORMS_URL)) as { activeStorms?: NhcStorm[] };
      return (payload.activeStorms ?? []).map((storm) => ({
        source: "noaa-nhc",
        name: storm.name ?? null,
        classification: storm.classification ?? null,
        latitude: storm.latitudeNumeric ?? null,
        longitude: storm.longitudeNumeric ?? null,
        movement: storm.movementDir ?? null,
        intensity_kt: storm.intensity ?? null,
      }));
    } catch (error) {
      console.warn("NOAA NHC current-storms fetch failed:", error);
      return fallback.getActiveAlerts();
    }
  }
}

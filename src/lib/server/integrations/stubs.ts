/**
 * Deterministic stub providers used until real adapters are wired.
 *
 * Stubs are seeded by input so responses are stable across calls — good
 * enough for demos and tests, and honest about being synthetic (every
 * response carries `"source": "stub"`).
 */

import { createHash } from "node:crypto";

import { utcnowIso } from "../time";
import type {
  CropPrice,
  PricingProvider,
  RoutingProvider,
  TransitEstimate,
  WeatherAlert,
  WeatherForecast,
  WeatherProvider,
} from "./interfaces";

const RISKS = ["low", "medium", "high"] as const;
const TRENDS = ["falling", "stable", "rising"] as const;

function bucket(key: string, size: number): number {
  return createHash("sha256").update(key).digest()[0] % size;
}

export class StubWeatherProvider implements WeatherProvider {
  async getForecast(island: string): Promise<WeatherForecast> {
    const risk = RISKS[bucket(`weather:${island}`, RISKS.length)];
    return {
      source: "stub",
      island,
      risk,
      summary: `${risk} storm risk over the next 72h`,
      observed_at: utcnowIso(),
    };
  }

  async getActiveAlerts(): Promise<WeatherAlert[]> {
    return [];
  }
}

export class StubRoutingProvider implements RoutingProvider {
  estimateTransit(originIsland: string, destinationIsland: string): TransitEstimate {
    const sameIsland = originIsland === destinationIsland;
    return {
      source: "stub",
      origin: originIsland,
      destination: destinationIsland,
      mode: sameIsland ? "land" : "sea",
      transit_hours: sameIsland
        ? 4
        : 12 + bucket(`route:${originIsland}->${destinationIsland}`, 36),
    };
  }
}

export class StubPricingProvider implements PricingProvider {
  getPrice(cropName: string, island: string | null = null): CropPrice {
    const base = 1.0 + bucket(`price:${cropName.toLowerCase()}`, 40) / 10.0;
    const trend = TRENDS[bucket(`trend:${cropName.toLowerCase()}:${island}`, TRENDS.length)];
    return {
      source: "stub",
      crop_name: cropName,
      island,
      unit_price_usd: Math.round(base * 100) / 100,
      trend,
    };
  }
}

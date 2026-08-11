/**
 * Predictive intelligence with explainable outputs.
 *
 * Each prediction returns the number, the inputs that produced it, and a
 * plain-language explanation, so operators can always see *why*. The models
 * are transparent heuristics today; they can be replaced by trained models
 * behind the same signatures.
 */

import { getPricingProvider, getRoutingProvider, getWeatherProvider } from "../integrations";
import type { Crop } from "../models";
import {
  agentActivities,
  buyers,
  crops,
  demands,
  farmers,
  ports,
  shipments,
  weatherEvents,
} from "../repositories";
import { daysBetween, todayIso } from "../time";

/** Approximate post-harvest shelf life in days for common crops. */
const SHELF_LIFE_DAYS: Record<string, number> = {
  banana: 14,
  mango: 10,
  tomato: 7,
  yam: 60,
  pepper: 12,
};
const DEFAULT_SHELF_LIFE = 14;

const TREND_FACTOR: Record<string, number> = { rising: 1.2, stable: 1.0, falling: 0.85 };
const RISK_DELAY_HOURS: Record<string, number> = { low: 0, medium: 12, high: 36 };

/** Case-insensitive exact match on a crop name. */
const sameCrop = (a: string | null, b: string) => (a ?? "").toLowerCase() === b.toLowerCase();

export interface FoodSecurityGap {
  crop_name: string;
  open_demand: number;
  available_supply: number;
  gap: number;
}

/** One-call dashboard aggregate: counts, food-security gaps, disruptions. */
export function supplyChainOverview() {
  const allCrops = crops.all();
  const allDemands = demands.all();
  const allShipments = shipments.all();

  const shipmentsByStatus: Record<string, number> = {};
  for (const shipment of allShipments) {
    shipmentsByStatus[shipment.status] = (shipmentsByStatus[shipment.status] ?? 0) + 1;
  }

  // Regional food security: open demand vs available supply per crop
  const supply = new Map<string, number>();
  for (const crop of allCrops) {
    const key = (crop.crop_name ?? "").toLowerCase();
    supply.set(key, (supply.get(key) ?? 0) + (crop.quantity || 0));
  }
  const openDemand = new Map<string, number>();
  for (const demand of allDemands) {
    if (demand.status !== "open") continue;
    const key = (demand.crop_name ?? "").toLowerCase();
    openDemand.set(key, (openDemand.get(key) ?? 0) + (demand.quantity || 0));
  }

  const gaps: FoodSecurityGap[] = [...openDemand.entries()]
    .filter(([crop, requested]) => requested > (supply.get(crop) ?? 0))
    .map(([crop, requested]) => ({
      crop_name: crop,
      open_demand: requested,
      available_supply: supply.get(crop) ?? 0,
      gap: requested - (supply.get(crop) ?? 0),
    }))
    .sort((a, b) => b.gap - a.gap);

  const activeHazards = weatherEvents
    .all()
    .filter((event) => event.severity === "high" || event.severity === "severe").length;
  const portsDisrupted = ports.all().filter((port) => port.status !== "open").length;

  let health: "healthy" | "strained" | "at_risk" = "healthy";
  if (gaps.length > 0 || portsDisrupted) health = "strained";
  if (activeHazards && (gaps.length > 0 || portsDisrupted)) health = "at_risk";

  return {
    health,
    counts: {
      farmers: farmers.count(),
      buyers: buyers.count(),
      crop_lots: allCrops.length,
      total_inventory: allCrops.reduce((total, crop) => total + (crop.quantity || 0), 0),
      open_demands: allDemands.filter((demand) => demand.status === "open").length,
      shipments: shipmentsByStatus,
      agent_activities: agentActivities.count(),
    },
    food_security_gaps: gaps.slice(0, 5),
    active_hazards: activeHazards,
    ports_disrupted: portsDisrupted,
    explanation:
      `${gaps.length} crop(s) with unmet open demand, ${activeHazards} active ` +
      `high/severe weather event(s), ${portsDisrupted} port(s) not fully open.`,
  };
}

/** Forecast near-term demand from open demand history and price trend. */
export function forecastDemand(cropName: string) {
  const matching = demands.all().filter((demand) => sameCrop(demand.crop_name, cropName));
  const quantities = matching.map((demand) => demand.quantity).filter(Boolean);
  const base =
    quantities.length > 0 ? quantities.reduce((a, b) => a + b, 0) / quantities.length : 0.0;

  const price = getPricingProvider().getPrice(cropName);
  const factor = TREND_FACTOR[price.trend] ?? 1.0;
  const forecast = Math.round(base * factor);

  return {
    crop_name: cropName,
    forecast_quantity: forecast,
    inputs: {
      historical_demands: quantities.length,
      average_demand: Math.round(base * 10) / 10,
      price_trend: price.trend,
      trend_factor: factor,
      unit_price_usd: price.unit_price_usd,
      price_source: price.source,
      price_as_of: price.price_as_of,
    },
    explanation:
      `Average of ${quantities.length} recorded demand(s) is ${base.toFixed(0)} units; ` +
      `price trend is ${price.trend}, scaling the forecast by ${factor}.`,
  };
}

/** Estimate spoilage risk from time since harvest vs shelf life. */
export function predictSpoilage(crop: Crop) {
  const shelfLife = SHELF_LIFE_DAYS[(crop.crop_name ?? "").toLowerCase()] ?? DEFAULT_SHELF_LIFE;
  if (crop.harvest_date === null) {
    return {
      crop_id: crop.id,
      risk: "unknown",
      explanation: "No harvest date recorded, so shelf life cannot be assessed.",
    };
  }

  const ageDays = daysBetween(crop.harvest_date, todayIso());
  const remaining = shelfLife - ageDays;
  let risk: string;
  if (remaining <= 0) {
    risk = "critical";
  } else if (remaining <= shelfLife * 0.25) {
    risk = "high";
  } else if (remaining <= shelfLife * 0.5) {
    risk = "medium";
  } else {
    risk = "low";
  }

  return {
    crop_id: crop.id,
    crop_name: crop.crop_name,
    risk,
    inputs: {
      harvest_date: crop.harvest_date,
      age_days: ageDays,
      shelf_life_days: shelfLife,
      remaining_days: remaining,
    },
    explanation:
      `${crop.crop_name} harvested ${ageDays} day(s) ago with a ` +
      `~${shelfLife}-day shelf life leaves ${Math.max(remaining, 0)} day(s); risk is ${risk}.`,
  };
}

/** Estimate transit time and weather-driven delay for a lane. */
export async function predictTransportDelay(originIsland: string, destinationIsland: string) {
  const transit = getRoutingProvider().estimateTransit(originIsland, destinationIsland);
  const weather = await getWeatherProvider().getForecast(destinationIsland);
  const delay = RISK_DELAY_HOURS[weather.risk] ?? 0;

  return {
    origin: originIsland,
    destination: destinationIsland,
    base_transit_hours: transit.transit_hours,
    expected_delay_hours: delay,
    total_hours: transit.transit_hours + delay,
    inputs: { routing: transit, weather },
    explanation:
      `Base transit is ${transit.transit_hours}h by ${transit.mode}; ` +
      `${weather.risk} weather risk at ${destinationIsland} adds ~${delay}h.`,
  };
}

/** Compare open demand against available supply for a crop. */
export function predictRegionalShortage(cropName: string) {
  const supply = crops
    .all()
    .filter((crop) => sameCrop(crop.crop_name, cropName))
    .reduce((total, crop) => total + (crop.quantity || 0), 0);
  const openDemand = demands
    .all()
    .filter((demand) => sameCrop(demand.crop_name, cropName) && demand.status === "open")
    .reduce((total, demand) => total + (demand.quantity || 0), 0);
  const gap = openDemand - supply;
  const shortage = gap > 0;

  return {
    crop_name: cropName,
    shortage_predicted: shortage,
    gap,
    inputs: { available_supply: supply, open_demand: openDemand },
    explanation: shortage
      ? `Open demand (${openDemand}) exceeds available supply (${supply}) by ${gap} units.`
      : `Available supply (${supply}) covers open demand (${openDemand}).`,
  };
}

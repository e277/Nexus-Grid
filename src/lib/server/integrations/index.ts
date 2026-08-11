/**
 * Provider registry: resolves the configured adapter for each interface.
 *
 * Real adapters (`open_meteo`/`geo`/`reference`) are the default — each
 * degrades gracefully to `stub` internally on failure (see their modules) —
 * but `stub` stays registered by name for tests or an explicit opt-out.
 * Callers never change either way.
 */

import type { PricingProvider, RoutingProvider, WeatherProvider } from "./interfaces";
import { ReferencePricingProvider } from "./pricing-reference";
import { GeoRoutingProvider } from "./routing-geo";
import { StubPricingProvider, StubRoutingProvider, StubWeatherProvider } from "./stubs";
import { OpenMeteoWeatherProvider } from "./weather-live";

const WEATHER_PROVIDERS = {
  stub: StubWeatherProvider,
  open_meteo: OpenMeteoWeatherProvider,
} as const;
const ROUTING_PROVIDERS = {
  stub: StubRoutingProvider,
  geo: GeoRoutingProvider,
} as const;
const PRICING_PROVIDERS = {
  stub: StubPricingProvider,
  reference: ReferencePricingProvider,
} as const;

const instances = new Map<string, unknown>();

function resolve<T>(kind: string, name: string, factory: new () => T): T {
  const key = `${kind}:${name}`;
  if (!instances.has(key)) instances.set(key, new factory());
  return instances.get(key) as T;
}

export function getWeatherProvider(
  name: keyof typeof WEATHER_PROVIDERS = "open_meteo"
): WeatherProvider {
  return resolve("weather", name, WEATHER_PROVIDERS[name]);
}

export function getRoutingProvider(
  name: keyof typeof ROUTING_PROVIDERS = "geo"
): RoutingProvider {
  return resolve("routing", name, ROUTING_PROVIDERS[name]);
}

export function getPricingProvider(
  name: keyof typeof PRICING_PROVIDERS = "reference"
): PricingProvider {
  return resolve("pricing", name, PRICING_PROVIDERS[name]);
}

export type {
  CropPrice,
  PricingProvider,
  RoutingProvider,
  TransitEstimate,
  WeatherAlert,
  WeatherForecast,
  WeatherProvider,
} from "./interfaces";

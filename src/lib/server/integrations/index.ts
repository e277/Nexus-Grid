/**
 * Provider registry for inter-island routing.
 *
 * Distance and transit come from real island coordinates rather than a live
 * carrier feed — no free inter-island freight API exists — and the estimate is
 * labelled `geo-estimate` rather than posing as a booking. The stub stays
 * registered by name as the fallback for islands outside the coordinate table.
 */

import type { RoutingProvider } from "./interfaces";
import { GeoRoutingProvider } from "./routing-geo";
import { StubRoutingProvider } from "./stubs";

const ROUTING_PROVIDERS = {
  stub: StubRoutingProvider,
  geo: GeoRoutingProvider,
} as const;

const instances = new Map<string, RoutingProvider>();

export function getRoutingProvider(
  name: keyof typeof ROUTING_PROVIDERS = "geo"
): RoutingProvider {
  if (!instances.has(name)) instances.set(name, new ROUTING_PROVIDERS[name]());
  return instances.get(name) as RoutingProvider;
}

export type { RoutingProvider, TransitEstimate } from "./interfaces";

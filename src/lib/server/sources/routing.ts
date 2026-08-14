/**
 * Inter-island routing: distance and transit between two member states.
 *
 * No free live inter-island freight API exists, so this computes the
 * great-circle distance between real island coordinates and derives a transit
 * estimate from a documented average speed. It is labelled `geo-estimate`
 * rather than posing as a carrier booking, and falls back to a deterministic
 * stub for islands outside the coordinate table.
 */

import { createHash } from "node:crypto";

import { haversineKm, lookupIsland } from "./geo";

export interface TransitEstimate {
  source: string;
  origin: string;
  destination: string;
  mode: "sea" | "air" | "land";
  transit_hours: number;
  distance_km?: number;
}

export interface RoutingProvider {
  /** Return a transit estimate: hours, mode, distance. */
  estimateTransit(originIsland: string, destinationIsland: string): TransitEstimate;
}

function bucket(key: string, size: number): number {
  return createHash("sha256").update(key).digest()[0] % size;
}

/** Deterministic fallback for islands outside the coordinate table. */
class StubRoutingProvider implements RoutingProvider {
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

// Average scheduled inter-island cargo/ferry speed, knots (~15) converted to
// km/h, plus a fixed port-handling overhead so short hops aren't
// unrealistically instant.
const AVG_SEA_SPEED_KMH = 15 * 1.852;
const PORT_HANDLING_HOURS = 3.0;

const fallback = new StubRoutingProvider();

export class GeoRoutingProvider implements RoutingProvider {
  estimateTransit(originIsland: string, destinationIsland: string): TransitEstimate {
    if (originIsland === destinationIsland) {
      return {
        source: "geo-estimate",
        origin: originIsland,
        destination: destinationIsland,
        mode: "land",
        transit_hours: 4,
      };
    }

    const origin = lookupIsland(originIsland);
    const destination = lookupIsland(destinationIsland);
    if (origin === null || destination === null) {
      return fallback.estimateTransit(originIsland, destinationIsland);
    }

    const distanceKm = haversineKm(origin, destination);
    const hours = Math.round((distanceKm / AVG_SEA_SPEED_KMH + PORT_HANDLING_HOURS) * 10) / 10;
    return {
      source: "geo-estimate",
      origin: originIsland,
      destination: destinationIsland,
      mode: "sea",
      distance_km: Math.round(distanceKm * 10) / 10,
      transit_hours: hours,
    };
  }
}

const geo = new GeoRoutingProvider();

/** The routing provider used across the platform. */
export function getRoutingProvider(): RoutingProvider {
  return geo;
}

/**
 * Deterministic routing fallback for islands outside the coordinate table.
 *
 * Seeded by input so responses are stable across calls, and honest about being
 * synthetic — every response carries `"source": "stub"`.
 */

import { createHash } from "node:crypto";

import type { RoutingProvider, TransitEstimate } from "./interfaces";

function bucket(key: string, size: number): number {
  return createHash("sha256").update(key).digest()[0] % size;
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

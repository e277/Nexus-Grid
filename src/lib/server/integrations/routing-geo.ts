/**
 * Geography-based routing provider — real inter-island distances, not a
 * guessed number.
 *
 * No free/keyless live inter-island freight-routing API exists publicly, so
 * this computes the great-circle distance between each island's real
 * coordinates (see `geo.ts`) and derives a transit estimate from a
 * documented average speed. It's honestly a distance-based estimate, not a
 * live carrier booking API — labeled `"source": "geo-estimate"` rather than
 * pretending otherwise. Falls back to the stub for islands outside the
 * coordinate table.
 */

import { haversineKm, lookupIsland } from "./geo";
import type { RoutingProvider, TransitEstimate } from "./interfaces";
import { StubRoutingProvider } from "./stubs";

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
      console.info(
        `No coordinates for ${originIsland} -> ${destinationIsland}; falling back to stub routing`
      );
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

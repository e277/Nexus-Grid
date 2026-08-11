/**
 * Routing provider interface.
 *
 * Expressed as an interface so a stub, a sandbox, or a real carrier adapter can
 * be swapped in without touching callers. Weather and pricing moved to the
 * sources layer, which fetches them with provenance.
 */

export interface TransitEstimate {
  source: string;
  origin: string;
  destination: string;
  mode: "sea" | "air" | "land";
  transit_hours: number;
  distance_km?: number;
}

/** Maps / routing (e.g. inter-island transit estimation). */
export interface RoutingProvider {
  /** Return a transit estimate: hours, mode, distance. */
  estimateTransit(originIsland: string, destinationIsland: string): TransitEstimate;
}


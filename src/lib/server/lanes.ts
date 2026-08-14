/**
 * Lanes: the routes a coordination plan would actually move over.
 *
 * Derived, not entered. Each substitution opportunity names an importer and
 * the member states already supplying that commodity into the region; pairing
 * the two gives the lanes that matter, and the routing provider turns each
 * pair into a real great-circle distance between the two main ports plus a
 * transit estimate from a documented average speed.
 *
 * What this deliberately does not claim: berth congestion, queue length,
 * vessel capacity, or a booking. No free inter-island freight API publishes
 * any of it, so rather than inventing a number the response says so in
 * `unobserved` and the page prints that alongside the figures it does have.
 */

import { matchAllGaps, type GapMatch } from "./matching";
import type { RegionalPicture } from "./projection";
import { lookupIsland } from "./sources/geo";
import { getRoutingProvider } from "./sources/routing";

export type Risk = "low" | "medium" | "high" | null;

export interface Lane {
  commodity: string;
  supplier: string;
  supplier_iso3: string;
  importer: string;
  importer_iso3: string;
  mode: "sea" | "air" | "land";
  distance_km: number | null;
  transit_hours: number;
  estimate_source: string;
  supplier_climate_risk: Risk;
  importer_climate_risk: Risk;
  status: "clear" | "watch" | "at_risk";
  external_usd: number;
}

/** Capital-or-main-port position, or null where the table has no entry. */
function coordinatesFor(name: string): [number, number] | null {
  const found = lookupIsland(name);
  return found ? [found[0], found[1]] : null;
}

export interface PortExposure {
  iso3: string;
  name: string;
  climate_risk: Risk;
  lanes: number;
  food_imports_usd: number;
}

function laneStatus(a: Risk, b: Risk): Lane["status"] {
  const elevated = [a, b].filter((r) => r === "high" || r === "medium").length;
  if (elevated === 2) return "at_risk";
  if (elevated === 1) return "watch";
  return "clear";
}

export function buildLanes(picture: RegionalPicture): {
  lanes: Lane[];
  ports: PortExposure[];
  /** Ranked suppliers per gap — which lane to open first, and why. */
  matches: GapMatch[];
  unobserved: string[];
} {
  const routing = getRoutingProvider();
  const byName = new Map(picture.states.map((s) => [s.name, s]));
  const riskOf = (name: string): Risk => byName.get(name)?.climate_risk ?? null;

  const lanes: Lane[] = [];
  const seen = new Set<string>();

  for (const opportunity of picture.substitution_opportunities) {
    for (const supplierName of opportunity.regional_suppliers) {
      const supplier = byName.get(supplierName);
      if (!supplier || supplier.iso3 === opportunity.importer_iso3) continue;

      // One row per commodity-lane; the same pair can carry several
      // commodities and each is its own coordination decision.
      const key = `${supplier.iso3}->${opportunity.importer_iso3}:${opportunity.commodity_code}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const transit = routing.estimateTransit(supplier.name, opportunity.importer);
      const supplierRisk = riskOf(supplier.name);
      const importerRisk = riskOf(opportunity.importer);

      lanes.push({
        commodity: opportunity.commodity,
        supplier: supplier.name,
        supplier_iso3: supplier.iso3,
        importer: opportunity.importer,
        importer_iso3: opportunity.importer_iso3,
        mode: transit.mode,
        distance_km: transit.distance_km ?? null,
        transit_hours: transit.transit_hours,
        estimate_source: transit.source,
        supplier_climate_risk: supplierRisk,
        importer_climate_risk: importerRisk,
        status: laneStatus(supplierRisk, importerRisk),
        external_usd: opportunity.external_usd,
      });
    }
  }

  lanes.sort((a, b) => b.external_usd - a.external_usd);

  const laneCount = new Map<string, number>();
  for (const lane of lanes) {
    laneCount.set(lane.supplier_iso3, (laneCount.get(lane.supplier_iso3) ?? 0) + 1);
    laneCount.set(lane.importer_iso3, (laneCount.get(lane.importer_iso3) ?? 0) + 1);
  }

  const ports: PortExposure[] = picture.states
    .filter((state) => laneCount.has(state.iso3))
    .map((state) => ({
      iso3: state.iso3,
      name: state.name,
      climate_risk: state.climate_risk,
      lanes: laneCount.get(state.iso3) ?? 0,
      food_imports_usd: state.food_imports_usd,
      // The same table the transit estimate is computed from, so a port sits
      // on the map exactly where the distance between lanes was measured.
      coordinates: coordinatesFor(state.name),
    }))
    .sort((a, b) => b.lanes - a.lanes);

  return {
    lanes,
    ports,
    matches: matchAllGaps(picture),
    unobserved: [
      "Berth congestion and queue length — no CARICOM port authority publishes a live feed.",
      "Vessel capacity and sailing schedules — no free inter-island freight API exists to query.",
      "Transit hours are a geometry estimate (great-circle distance at a documented average sea speed plus fixed port handling), not a carrier quote.",
    ],
  };
}

/**
 * Supplier matching: for a sourcing gap, which member state should cover it.
 *
 * The lanes layer answers "what routes exist" — every regional supplier of a
 * commodity paired with every state buying it externally. That is a list, and
 * a list of sixty lanes is not a decision. This ranks them: for one gap, which
 * supplier is the best one to approach first, and why.
 *
 * Every input is observed or derived, never assumed:
 *
 * - **Transit** — great-circle distance between the two main ports at a
 *   documented average sea speed. A geometry estimate, and labelled as one.
 * - **Weather** — live climate risk at both ends, which is the only part of a
 *   lane this platform watches in real time.
 * - **Complementary planting** — whether the supplier can plant rain-fed in
 *   months the importer cannot. A supplier that harvests when the importer
 *   already has its own crop is worth less than one that fills a gap month.
 * - **Established trade** — whether the supplier already ships that commodity
 *   into the region. A state that has never exported it is a longer bet than
 *   one with an existing lane, whatever the geography says.
 *
 * What is deliberately *not* scored: price, vessel capacity, contract terms
 * and port throughput. No free source publishes any of them for this region,
 * and a ranking that silently weighted an invented number would be worse than
 * no ranking at all. The score is presented as what it is — a shortlist to
 * approach in order, not a procurement decision.
 */

import type { PlantingAlignment, RegionalPicture, StateProfile } from "./projection";
import { getRoutingProvider } from "./sources/routing";

export type Risk = "low" | "medium" | "high" | null;

/** How much each factor can contribute. They sum to 100. */
const WEIGHTS = {
  transit: 35,
  weather: 25,
  complementaryPlanting: 20,
  establishedTrade: 20,
} as const;

/** Transit beyond this scores zero; within it, closer is better. */
const SLOWEST_USEFUL_HOURS = 96;

export interface MatchFactor {
  label: string;
  /** 0..1 before weighting. */
  score: number;
  /** Points contributed to the total out of 100. */
  points: number;
  /** What this factor actually observed, for the operator to check. */
  detail: string;
}

export interface SupplierMatch {
  supplier: string;
  supplier_iso3: string;
  /** 0..100. Comparable only between suppliers for the same gap. */
  score: number;
  rank: number;
  transit_hours: number;
  distance_km: number | null;
  supplier_climate_risk: Risk;
  importer_climate_risk: Risk;
  complementary_months: string[];
  already_supplies_region: boolean;
  factors: MatchFactor[];
  /** One sentence an operator can read instead of the table. */
  rationale: string;
}

export interface GapMatch {
  commodity: string;
  commodity_code: string;
  importer: string;
  importer_iso3: string;
  /** Value bought outside the region on this commodity, USD. */
  external_usd: number;
  external_share_pct: number;
  matches: SupplierMatch[];
  /** Stated rather than implied — see the module comment. */
  not_scored: string[];
}

function riskScore(risk: Risk): number {
  if (risk === "high") return 0;
  if (risk === "medium") return 0.5;
  // An unknown reading is treated as neither good nor bad. Scoring it as clear
  // would reward a state precisely because nothing is known about it.
  if (risk === null) return 0.5;
  return 1;
}

function riskWord(risk: Risk): string {
  return risk ?? "unknown";
}

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Rank the regional suppliers that could cover one importer's sourcing gap.
 *
 * Returns them best-first. A supplier the routing layer cannot place is
 * dropped rather than scored on a guessed distance.
 */
export function matchSuppliers(
  picture: RegionalPicture,
  gap: RegionalPicture["substitution_opportunities"][number]
): GapMatch {
  const routing = getRoutingProvider();
  const byName = new Map(picture.states.map((s) => [s.name, s]));
  const importer = byName.get(gap.importer) ?? null;

  const alignmentFor = (supplierName: string): PlantingAlignment | undefined =>
    picture.planting_alignment.find(
      (a) =>
        a.supplier === supplierName &&
        a.importer === gap.importer &&
        a.commodity === gap.commodity
    );

  const matches: SupplierMatch[] = [];

  for (const supplierName of gap.regional_suppliers) {
    const supplier: StateProfile | undefined = byName.get(supplierName);
    if (!supplier || supplier.iso3 === gap.importer_iso3) continue;

    const transit = routing.estimateTransit(supplier.name, gap.importer);
    // A stub estimate is a hashed number, not a measurement. Ranking on one
    // would be ranking on noise.
    if (transit.source !== "geo-estimate") continue;

    const supplierRisk = supplier.climate_risk ?? null;
    const importerRisk = importer?.climate_risk ?? null;

    const transitScore = Math.max(
      0,
      Math.min(1, 1 - transit.transit_hours / SLOWEST_USEFUL_HOURS)
    );
    // Both ends have to be clear for a lane to run, so the weaker end sets it.
    const weatherScore = Math.min(riskScore(supplierRisk), riskScore(importerRisk));

    const alignment = alignmentFor(supplier.name);
    const complementary = alignment?.complementary_months ?? [];
    // Six complementary months is full marks — half the year covered by the
    // partner is as much as staggering can buy.
    const plantingScore = Math.min(1, complementary.length / 6);

    // Every candidate here is a regional supplier of this commodity by
    // definition; the distinction is whether it also trades at volume.
    const established = supplier.food_imports_usd > 0;
    const tradeScore = established ? 1 : 0.5;

    const factors: MatchFactor[] = [
      {
        label: "Transit",
        score: transitScore,
        points: round(transitScore * WEIGHTS.transit),
        detail:
          `~${transit.transit_hours}h by ${transit.mode}` +
          (transit.distance_km ? ` over ${Math.round(transit.distance_km)} km` : "") +
          " (geometry estimate, not a carrier quote)",
      },
      {
        label: "Weather at both ends",
        score: weatherScore,
        points: round(weatherScore * WEIGHTS.weather),
        detail: `${riskWord(supplierRisk)} at ${supplier.name}, ${riskWord(importerRisk)} at ${gap.importer} (Open-Meteo)`,
      },
      {
        label: "Complementary planting",
        score: plantingScore,
        points: round(plantingScore * WEIGHTS.complementaryPlanting),
        detail:
          complementary.length > 0
            ? `can plant rain-fed in ${complementary.length} month(s) ${gap.importer} cannot: ${complementary.join(", ")} (NASA POWER)`
            : `no month ${supplier.name} can plant that ${gap.importer} cannot`,
      },
      {
        label: "Established regional trade",
        score: tradeScore,
        points: round(tradeScore * WEIGHTS.establishedTrade),
        detail: established
          ? `already ships ${gap.commodity.toLowerCase()} into CARICOM and trades at observed volume (UN Comtrade)`
          : `ships ${gap.commodity.toLowerCase()} into CARICOM, but no import volume observed for this state`,
      },
    ];

    const score = round(factors.reduce((sum, f) => sum + f.points, 0));

    matches.push({
      supplier: supplier.name,
      supplier_iso3: supplier.iso3,
      score,
      rank: 0,
      transit_hours: transit.transit_hours,
      distance_km: transit.distance_km ?? null,
      supplier_climate_risk: supplierRisk,
      importer_climate_risk: importerRisk,
      complementary_months: complementary,
      already_supplies_region: true,
      factors,
      rationale: buildRationale(supplier.name, gap.importer, transit.transit_hours, supplierRisk, importerRisk, complementary),
    });
  }

  matches.sort((a, b) => b.score - a.score);
  matches.forEach((match, index) => {
    match.rank = index + 1;
  });

  return {
    commodity: gap.commodity,
    commodity_code: gap.commodity_code,
    importer: gap.importer,
    importer_iso3: gap.importer_iso3,
    external_usd: gap.external_usd,
    external_share_pct: gap.external_share_pct,
    matches,
    not_scored: [
      "Price and contract terms — no regional price feed is published.",
      "Vessel capacity and sailing schedules — no free inter-island freight API exists.",
      "Port throughput and berth availability — no CARICOM port authority publishes a live feed.",
    ],
  };
}

function buildRationale(
  supplier: string,
  importer: string,
  hours: number,
  supplierRisk: Risk,
  importerRisk: Risk,
  complementary: string[]
): string {
  const parts = [`${supplier} is about ${hours}h from ${importer} by sea`];

  // "Clear" is a claim, and an unread station is not a clear one. The score
  // already treats unknown as neither good nor bad; the sentence has to say
  // the same thing rather than round it up to good news.
  const ends = [supplierRisk, importerRisk];
  const elevated = ends.filter((r) => r === "high" || r === "medium").length;
  const unknown = ends.filter((r) => r === null).length;

  if (elevated === 2) parts.push("but with elevated climate risk at both ends");
  else if (elevated === 1) parts.push("with elevated climate risk at one end");
  else if (unknown === 2) parts.push("though neither end has a current weather reading");
  else if (unknown === 1) parts.push("with clear weather at one end and no reading at the other");
  else parts.push("with clear weather at both ends");

  if (complementary.length > 0) {
    parts.push(
      `and can plant rain-fed in ${complementary.length} month(s) ${importer} cannot, so the two can stagger rather than compete`
    );
  }

  return `${parts.join(", ")}.`;
}

/** Rank suppliers for every observed gap, largest gap first. */
export function matchAllGaps(picture: RegionalPicture): GapMatch[] {
  return picture.substitution_opportunities
    .map((gap) => matchSuppliers(picture, gap))
    .filter((match) => match.matches.length > 0)
    .sort((a, b) => b.external_usd - a.external_usd);
}

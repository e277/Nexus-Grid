/**
 * The regional picture, derived from upstream snapshots.
 *
 * This is a read model, not a system of record: everything here is computed
 * from what the sources returned on the last fetch and is thrown away on the
 * next one. Nothing is entered by hand.
 *
 * The point of computing it at all is that no single member state can see any
 * of these numbers from its own systems — they only exist once the sources are
 * lined up against each other.
 */

import { CARICOM_STATES } from "./sources/caricom";
import type {
  ClimateSignal,
  Observation,
  SourceBundle,
  StormSignal,
  TradeFlow,
} from "./sources";

export interface StateProfile {
  iso3: string;
  name: string;
  /** Food imports as a share of all merchandise imports, latest year. */
  food_import_share_pct: number | null;
  arable_land_pct: number | null;
  agriculture_value_added_pct: number | null;
  population: number | null;
  /** Total food imports observed in the trade data, USD. */
  food_imports_usd: number;
  /** Share of those imports sourced from inside CARICOM. */
  intra_caricom_share_pct: number | null;
  climate_risk: ClimateSignal["risk"] | null;
  year: number | null;
}

export interface SubstitutionOpportunity {
  commodity: string;
  commodity_code: string;
  /** State doing the importing. */
  importer: string;
  importer_iso3: string;
  /** Value currently sourced from outside the region, USD. */
  external_usd: number;
  /** Value already sourced from inside the region, USD. */
  intra_usd: number;
  /** Share of this commodity's imports coming from outside CARICOM. */
  external_share_pct: number;
  /** Member states that already export this commodity into the region. */
  regional_suppliers: string[];
  top_external_partners: string[];
}

export interface RegionalPicture {
  states: StateProfile[];
  totals: {
    food_imports_usd: number;
    intra_caricom_usd: number;
    intra_caricom_share_pct: number | null;
    states_covered: number;
    trade_year: number | null;
  };
  substitution_opportunities: SubstitutionOpportunity[];
  climate: {
    islands_at_risk: ClimateSignal[];
    active_storms: StormSignal[];
  };
  /** Sources that did not return data, so gaps are visible not implied. */
  gaps: string[];
}

/** Most recent non-null observation of an indicator for a country. */
function latest(observations: Observation[], iso3: string, indicator: string): Observation | null {
  return (
    observations
      .filter((o) => o.country_iso3 === iso3 && o.indicator === indicator)
      .sort((a, b) => b.year - a.year)[0] ?? null
  );
}

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function buildRegionalPicture(bundle: SourceBundle): RegionalPicture {
  const observations = bundle.indicators.records;
  const flows = bundle.trade.records;
  const climate = bundle.climate.records;

  const climateByIso3 = new Map(climate.map((c) => [c.country_iso3, c]));

  const states: StateProfile[] = CARICOM_STATES.map((state) => {
    const stateFlows = flows.filter((f) => f.reporter_iso3 === state.iso3);
    const total = stateFlows.reduce((sum, f) => sum + f.value_usd, 0);
    const intra = stateFlows
      .filter((f) => f.partner_is_caricom)
      .reduce((sum, f) => sum + f.value_usd, 0);

    const foodImports = latest(observations, state.iso3, "TM.VAL.FOOD.ZS.UN");
    const arable = latest(observations, state.iso3, "AG.LND.ARBL.ZS");
    const agriculture = latest(observations, state.iso3, "NV.AGR.TOTL.ZS");
    const population = latest(observations, state.iso3, "SP.POP.TOTL");

    return {
      iso3: state.iso3,
      name: state.name,
      food_import_share_pct: foodImports ? round(foodImports.value) : null,
      arable_land_pct: arable ? round(arable.value, 2) : null,
      agriculture_value_added_pct: agriculture ? round(agriculture.value) : null,
      population: population ? Math.round(population.value) : null,
      food_imports_usd: Math.round(total),
      intra_caricom_share_pct: total > 0 ? round((intra / total) * 100) : null,
      climate_risk: climateByIso3.get(state.iso3)?.risk ?? null,
      year: foodImports?.year ?? null,
    };
  });

  const totalImports = flows.reduce((sum, f) => sum + f.value_usd, 0);
  const totalIntra = flows
    .filter((f) => f.partner_is_caricom)
    .reduce((sum, f) => sum + f.value_usd, 0);

  return {
    states,
    totals: {
      food_imports_usd: Math.round(totalImports),
      intra_caricom_usd: Math.round(totalIntra),
      intra_caricom_share_pct: totalImports > 0 ? round((totalIntra / totalImports) * 100) : null,
      states_covered: new Set(flows.map((f) => f.reporter_iso3)).size,
      trade_year: flows[0]?.year ?? null,
    },
    substitution_opportunities: findSubstitutionOpportunities(flows),
    climate: {
      islands_at_risk: climate.filter((c) => c.risk === "high" || c.risk === "medium"),
      active_storms: bundle.storms.records,
    },
    gaps: collectGaps(bundle),
  };
}

/**
 * Where a member state buys food from outside the region that another member
 * state already supplies into it.
 *
 * This is the coordination question the brief asks — aligning what is grown
 * with where it is needed — expressed in the only data that spans both sides:
 * who currently ships what to whom.
 */
function findSubstitutionOpportunities(flows: TradeFlow[]): SubstitutionOpportunity[] {
  // A member state counts as a regional supplier of a commodity when it
  // already appears as a CARICOM partner on someone else's imports.
  const suppliersByCommodity = new Map<string, Set<string>>();
  for (const flow of flows) {
    if (!flow.partner_is_caricom) continue;
    const set = suppliersByCommodity.get(flow.commodity_code) ?? new Set<string>();
    set.add(flow.partner);
    suppliersByCommodity.set(flow.commodity_code, set);
  }

  const grouped = new Map<string, TradeFlow[]>();
  for (const flow of flows) {
    const key = `${flow.reporter_iso3}|${flow.commodity_code}`;
    grouped.set(key, [...(grouped.get(key) ?? []), flow]);
  }

  const opportunities: SubstitutionOpportunity[] = [];
  for (const group of grouped.values()) {
    const external = group.filter((f) => !f.partner_is_caricom);
    const externalValue = external.reduce((sum, f) => sum + f.value_usd, 0);
    const intraValue = group
      .filter((f) => f.partner_is_caricom)
      .reduce((sum, f) => sum + f.value_usd, 0);
    const total = externalValue + intraValue;
    if (total === 0 || externalValue === 0) continue;

    const suppliers = [...(suppliersByCommodity.get(group[0].commodity_code) ?? [])].filter(
      (name) => name !== group[0].reporter
    );
    if (suppliers.length === 0) continue;

    opportunities.push({
      commodity: group[0].commodity,
      commodity_code: group[0].commodity_code,
      importer: group[0].reporter,
      importer_iso3: group[0].reporter_iso3,
      external_usd: Math.round(externalValue),
      intra_usd: Math.round(intraValue),
      external_share_pct: round((externalValue / total) * 100),
      regional_suppliers: suppliers.slice(0, 5),
      top_external_partners: external
        .sort((a, b) => b.value_usd - a.value_usd)
        .slice(0, 3)
        .map((f) => f.partner),
    });
  }

  return opportunities.sort((a, b) => b.external_usd - a.external_usd).slice(0, 12);
}

function collectGaps(bundle: SourceBundle): string[] {
  return Object.values(bundle)
    .filter((snapshot) => snapshot.provenance.status !== "live")
    .map(
      (snapshot) =>
        `${snapshot.provenance.publisher}: ${snapshot.provenance.status}` +
        (snapshot.provenance.note ? ` — ${snapshot.provenance.note}` : "")
    );
}

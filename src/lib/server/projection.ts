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
  MonthlyClimate,
  Observation,
  SoilProfile,
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
  /** What the state can grow, not just what it buys. */
  cereal_yield_kg_ha: number | null;
  cereal_land_ha: number | null;
  /** Directly observed (World Bank `AG.PRD.CREL.MT`) — not land × yield, which
   *  would silently multiply two indicators `latest()` may pick from different
   *  years. */
  cereal_production_mt: number | null;
  cereal_production_year: number | null;
  agricultural_land_pct: number | null;
  /** Soil under the main growing area, when the grid covers it. */
  soil: SoilProfile | null;
  /** Months a season can be started on rainfall alone. */
  rain_fed_months: string[];
}

/**
 * Where two states' rain-fed windows do not overlap for a commodity one
 * imports and the other supplies — the opening for staggered planting so the
 * region covers more of the calendar instead of gluting the same weeks.
 */
export interface PlantingAlignment {
  commodity: string;
  importer: string;
  importer_iso3: string;
  supplier: string;
  supplier_iso3: string;
  /** Months the supplier can plant rain-fed that the importer cannot. */
  complementary_months: string[];
  external_usd: number;
  note: string;
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
  planting_alignment: PlantingAlignment[];
  climate: {
    islands_at_risk: ClimateSignal[];
    active_storms: StormSignal[];
  };
  agronomy: {
    states_with_soil_coverage: number;
    states_with_planting_calendar: number;
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

  const soilRecords = bundle.soil.records;
  const agroclimate = bundle.agroclimate.records;

  const climateByIso3 = new Map(climate.map((c) => [c.country_iso3, c]));
  const soilByIso3 = new Map(soilRecords.map((s) => [s.country_iso3, s]));
  const calendarByIso3 = new Map(agroclimate.map((a) => [a.country_iso3, a]));

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
    const cerealYield = latest(observations, state.iso3, "AG.YLD.CREL.KG");
    const cerealLand = latest(observations, state.iso3, "AG.LND.CREL.HA");
    const cerealProduction = latest(observations, state.iso3, "AG.PRD.CREL.MT");
    const agriLand = latest(observations, state.iso3, "AG.LND.AGRI.ZS");
    const calendar = calendarByIso3.get(state.iso3) ?? null;

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
      cereal_yield_kg_ha: cerealYield ? Math.round(cerealYield.value) : null,
      cereal_land_ha: cerealLand ? Math.round(cerealLand.value) : null,
      cereal_production_mt: cerealProduction ? Math.round(cerealProduction.value) : null,
      cereal_production_year: cerealProduction?.year ?? null,
      agricultural_land_pct: agriLand ? round(agriLand.value) : null,
      soil: soilByIso3.get(state.iso3) ?? null,
      rain_fed_months: calendar?.rain_fed_months ?? [],
    };
  });

  const opportunities = findSubstitutionOpportunities(flows);
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
    substitution_opportunities: opportunities,
    planting_alignment: findPlantingAlignment(opportunities, calendarByIso3),
    climate: {
      islands_at_risk: climate.filter((c) => c.risk === "high" || c.risk === "medium"),
      active_storms: bundle.storms.records,
    },
    agronomy: {
      states_with_soil_coverage: soilRecords.filter((s) => s.has_coverage).length,
      states_with_planting_calendar: agroclimate.length,
    },
    gaps: collectGaps(bundle),
  };
}

/**
 * Pair each substitution opportunity with a regional supplier whose rain-fed
 * planting window differs from the importer's.
 *
 * Two islands that can only plant the same three months compete; two whose
 * windows differ can cover more of the year between them. That is the
 * difference between a shared calendar and fifteen separate ones, and it is
 * only visible once every state's calendar comes from the same model.
 */
function findPlantingAlignment(
  opportunities: SubstitutionOpportunity[],
  calendars: Map<string, MonthlyClimate>
): PlantingAlignment[] {
  const byName = new Map([...calendars.values()].map((c) => [c.country, c]));
  const alignment: PlantingAlignment[] = [];

  for (const opportunity of opportunities) {
    const importer = calendars.get(opportunity.importer_iso3);
    if (!importer) continue;

    for (const supplierName of opportunity.regional_suppliers) {
      const supplier = byName.get(supplierName);
      if (!supplier) continue;

      const importerMonths = new Set(importer.rain_fed_months);
      const complementary = supplier.rain_fed_months.filter((m) => !importerMonths.has(m));
      if (complementary.length === 0) continue;

      alignment.push({
        commodity: opportunity.commodity,
        importer: opportunity.importer,
        importer_iso3: opportunity.importer_iso3,
        supplier: supplier.country,
        supplier_iso3: supplier.country_iso3,
        complementary_months: complementary,
        external_usd: opportunity.external_usd,
        note:
          `${supplier.country} can plant rain-fed in ${complementary.length} month(s) ` +
          `${opportunity.importer} cannot, so staggering ${opportunity.commodity.toLowerCase()} ` +
          `between them widens regional coverage instead of doubling up.`,
      });
      break;
    }
  }

  return alignment.sort((a, b) => b.external_usd - a.external_usd).slice(0, 8);
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

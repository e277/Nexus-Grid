import type { SourceUse } from "./components/SourceBar";
import type { AnalysisDomain } from "./types";

/**
 * Which upstream publisher feeds which page, and what it contributes there.
 *
 * Each page is now an agent's reading rather than a rendering of the
 * projection, so these lines name what the agent was *given* for that domain —
 * the inputs behind its findings. That is what makes the panel worth showing:
 * when a publisher is down, the reader can see which of the agent's
 * conclusions are standing on missing ground.
 *
 * Kept in one file because it is a claim about the code that has to stay true:
 * if a domain's prompt starts reading a new slot, its entry here changes with
 * it. See `lib/server/interpretation/analysis.ts` for the prompts themselves.
 *
 * Derived from `SourceBundle` in `lib/server/sources/index.ts`:
 *   indicators  → World Bank Open Data
 *   trade       → UN Comtrade
 *   climate     → Open-Meteo
 *   storms      → NOAA National Hurricane Center
 *   soil        → ISRIC SoilGrids
 *   agroclimate → NASA POWER
 */

/** Dashboard — what a coordination run is triggered against and monitored on. */
export const DASHBOARD_SOURCES: SourceUse[] = [
  {
    slot: "trade",
    contributes:
      "The sourcing gap every run is triggered against — importer, commodity, the value bought outside the region, and which member states already supply it.",
  },
  {
    slot: "climate",
    contributes:
      "Climate risk at the importing state, which the monitor step reads as the disruption signal that can force one re-plan.",
  },
];

/** Farm-to-Market — the agent reads one commodity trade table. */
export const FARM_TO_MARKET_SOURCES: SourceUse[] = [
  {
    slot: "trade",
    contributes:
      "Everything the agent reads here: the regional import bill, the intra-CARICOM share, and every commodity–importer gap with its external share and existing regional suppliers.",
  },
];

/** Soil & Crop Intel — growing conditions, from four publishers plus storms. */
export const SOIL_SOURCES: SourceUse[] = [
  {
    slot: "soil",
    contributes:
      "pH, organic carbon and clay content under each state's main growing point, and the suitability note derived from them.",
  },
  {
    slot: "indicators",
    contributes:
      "Arable land, agricultural land, cereal yield and agriculture's share of GDP for each member state.",
  },
  {
    slot: "agroclimate",
    contributes: "How many months each state can start a season on rainfall alone.",
  },
  {
    slot: "climate",
    contributes: "Current climate risk per island, which bounds what the conditions actually permit.",
  },
  {
    slot: "storms",
    contributes: "Named storms active in the basin right now.",
  },
];

/** Planting Coordination — the calendar, and what makes a pair worth staggering. */
export const PLANTING_SOURCES: SourceUse[] = [
  {
    slot: "agroclimate",
    contributes:
      "Every state's rain-fed planting window — the calendar the agent reasons over to find overlap and complement.",
  },
  {
    slot: "trade",
    contributes:
      "Which supplier–importer pairs are worth staggering at all, and the external sourcing at stake behind each one.",
  },
];

/** Port & Logistics — which lanes exist, and the weather at both ends. */
export const LOGISTICS_SOURCES: SourceUse[] = [
  {
    slot: "trade",
    contributes:
      "Which lanes exist at all: each sourcing gap paired with the member states already supplying that commodity, and the value each lane could displace.",
  },
  {
    slot: "climate",
    contributes:
      "Live risk at both ends of every lane, which is what sets each lane's clear / watch / at-risk status.",
  },
  {
    slot: "storms",
    contributes: "Named storms active in the basin.",
  },
];

/** Distribution — calendar-lock timing, per-capita exposure, and observed cereal scale. */
export const DISTRIBUTION_SOURCES: SourceUse[] = [
  {
    slot: "indicators",
    contributes:
      "Population (for per-resident import exposure) and directly observed cereal production, in metric tons, per member state.",
  },
  {
    slot: "agroclimate",
    contributes:
      "Every regional supplier's rain-fed planting window, checked against the current month to find gaps with no window open right now.",
  },
];

/**
 * Impact Metrics reads every domain, so it names every publisher behind them.
 *
 * The per-page rule still holds — this page really does rest on all six,
 * because it compares conclusions drawn from all six. What each line says is
 * what that publisher contributed *to the comparison*, not a restatement of
 * its role on the page where its figures were first read.
 */
export const ANALYSIS_SOURCES: SourceUse[] = [
  {
    slot: "trade",
    contributes:
      "Every sourcing gap the findings are drawn from, and the supplier ranking's trade evidence.",
  },
  {
    slot: "climate",
    contributes: "Live risk at both ends of each lane, which the supplier score weighs.",
  },
  {
    slot: "agroclimate",
    contributes: "The planting windows behind the complementary-season factor in that score.",
  },
  {
    slot: "soil",
    contributes: "Growing conditions behind the soil agent's findings.",
  },
  {
    slot: "indicators",
    contributes: "Agricultural capacity per member state, behind the soil and outcome readings.",
  },
  {
    slot: "storms",
    contributes: "Named storms in the basin, which qualify the logistics findings.",
  },
];

/** The slots one domain's agent was actually given. */
export function sourcesForDomain(domain: AnalysisDomain): SourceUse[] {
  switch (domain) {
    case "market":
      return FARM_TO_MARKET_SOURCES;
    case "soil":
      return SOIL_SOURCES;
    case "planting":
      return PLANTING_SOURCES;
    case "logistics":
      return LOGISTICS_SOURCES;
    case "distribution":
      return DISTRIBUTION_SOURCES;
    default:
      // The outcome reading draws on the whole picture rather than one slice.
      return ANALYSIS_SOURCES;
  }
}

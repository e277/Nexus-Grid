import type { SourceUse } from "./components/SourceBar";

/**
 * Which upstream publisher feeds which page, and what it contributes there.
 *
 * Kept in one file because it is a claim about the code that has to stay true:
 * if a page starts reading a new slot, its entry here is what has to change
 * with it. Each line names the figures on that page, not the publisher's
 * catalogue in general — "arable land and cereal yield" is checkable against
 * the view; "agricultural indicators" is not.
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

/** Farm-to-Market — every number on the page is one commodity trade table. */
export const FARM_TO_MARKET_SOURCES: SourceUse[] = [
  {
    slot: "trade",
    contributes:
      "Every figure here: the regional import bill, the intra-CARICOM share, and each commodity–importer gap with its external share and existing regional suppliers.",
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
      "Arable land, agricultural land, cereal yield and agriculture's share of GDP — four of the five radar axes.",
  },
  {
    slot: "agroclimate",
    contributes:
      "How many months each state can start a season on rainfall alone — the fifth radar axis and the rain-fed column.",
  },
  {
    slot: "climate",
    contributes: "Current climate risk per island, shown on each soil card and in the table.",
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
      "The whole calendar on this page: each state's rain-fed planting window, the monthly coverage chart, and the window grid.",
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
    contributes: "Named storms active in the basin, shown as a banner above the lanes.",
  },
];

/** Impact Metrics — the ceiling on coordination against this snapshot. */
export const IMPACT_SOURCES: SourceUse[] = [
  {
    slot: "trade",
    contributes:
      "The region's import bill, what is already sourced regionally, the substitution ceiling, and the lane count behind it.",
  },
  {
    slot: "agroclimate",
    contributes: "The planting months that could be aligned across the staggerable pairs.",
  },
];

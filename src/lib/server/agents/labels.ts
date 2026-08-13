/**
 * Human names for the agents and the decisions they record.
 *
 * The identifiers themselves stay as they are: `supply_intelligence` is the
 * key an activity is filed and filtered under, and renaming it would orphan
 * every record already written. What changes is that nothing shows a reader
 * the key any more.
 *
 * This matters beyond tidiness. Agent decisions are fed to the outcomes
 * analyst as context, so a line reading `supply_intelligence: no_material_gap`
 * went into a prompt and came back out inside a recommendation — the console
 * was quoting its own internal identifiers back at an operator as if they were
 * findings.
 */

export const AGENT_TITLES: Record<string, string> = {
  supply_intelligence: "Supply Intelligence",
  demand_intelligence: "Demand Intelligence",
  planting_coordination: "Planting Coordination",
  climate_risk: "Climate Risk",
  logistics: "Logistics",
  agronomy: "Agronomy",
  supervisor: "Supervisor",
};

/**
 * What each recorded action means, in words.
 *
 * Phrased as the outcome rather than the event — "Found no material sourcing
 * gap" rather than "no_material_gap" — because these are read as a list of
 * what the agents concluded.
 */
export const ACTION_LABELS: Record<string, string> = {
  // Supply
  substitution_scan: "Scanned for substitution opportunities",
  no_material_gap: "Found no material sourcing gap",
  substitution_gap: "Flagged a sourcing gap",
  periodic_scan: "Ran a periodic scan",
  // Demand
  match_regional_supply: "Matched demand to regional supply",
  no_regional_supplier: "Found no regional supplier",
  no_gap_found: "Found no gap",
  // Planting
  stagger_planting: "Recommended staggered planting",
  no_complementary_window: "Found no complementary planting window",
  no_calendar_data: "Had no planting calendar to work from",
  // Agronomy
  soil_supports_crop: "Judged the soil suitable",
  soil_constrains_crop: "Judged the soil a constraint",
  soil_profile: "Read the soil profile",
  no_soil_coverage: "Had no soil coverage at this point",
  // Climate
  monitor_disruption: "Monitored for disruption",
  recommend_hold: "Recommended holding",
  no_action: "Took no action",
  // Logistics
  lane_viable: "Judged the lane viable",
  lane_at_risk: "Judged the lane at risk",
  lane_unresolved: "Could not resolve the lane",
  no_route: "Found no route",
};

/** A readable agent name; falls back to title-casing an unmapped identifier. */
export function agentTitle(name: string): string {
  return AGENT_TITLES[name] ?? titleCase(name);
}

/** A readable action; falls back to de-snaking an unmapped identifier. */
export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? sentenceCase(action);
}

function titleCase(identifier: string): string {
  return identifier
    .split(/[_-]/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function sentenceCase(identifier: string): string {
  const words = identifier.split(/[_-]/).filter(Boolean).join(" ");
  return words ? words[0].toUpperCase() + words.slice(1) : identifier;
}

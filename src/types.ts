export interface AgentActivity {
  id: number;
  agent_name: string;
  action: string;
  confidence?: number | null;
  created_at?: string | null;
  /** Readable forms the route derives from `agent_name` and `action`. */
  agent_title?: string;
  action_label?: string;
  /** What the agent ran with and returned — `outputs` shape is agent-specific. */
  context?: { payload: Record<string, unknown>; outputs: Record<string, unknown> } | null;
}

export interface AuditLog {
  id: number;
  actor: string;
  action: string;
  entity_type?: string | null;
  entity_id?: number | null;
  /** Free text the writer attached — the operator's note at the gate. */
  detail?: string | null;
  created_at?: string | null;
}

export interface Health {
  status: string;
  app: string;
  version: string;
  environment: string;
  /** How often the supply agent's background scan ticks, in seconds. */
  agent_poll_interval_seconds?: number;
}

/** What a human may answer at the approval gate. */
export type GateDecision = "approved" | "modified" | "rejected" | "escalated";

// ── Agent analysis ────────────────────────────────────────────────────────

export type AnalysisDomain = "market" | "soil" | "planting" | "logistics" | "impact" | "distribution";

export type FindingSeverity = "critical" | "opportunity" | "watch" | "gap";

export type MetricUnit = "usd" | "percent" | "count" | "months" | "hours" | "km";

/** A figure the agent attached to its own finding, for the console to draw. */
export interface FindingMetric {
  label: string;
  value: number;
  unit: MetricUnit;
  /** The whole this value is part of, when it is a part. */
  of: number | null;
}

/** One conclusion an agent reached, with the figures it rests on. */
export interface Finding {
  title: string;
  finding: string;
  recommendation: string;
  evidence: string[];
  severity: FindingSeverity;
  confidence: "low" | "medium" | "high";
  states: string[];
  metrics: FindingMetric[];
}

export interface AnalysisResult {
  domain: AnalysisDomain;
  /** Model that produced this, or `rules` for the deterministic fallback. */
  source: string;
  summary: string;
  findings: Finding[];
  note?: string;
  generated_at: string;
}

export interface AnalysisResponse {
  analysis: AnalysisResult;
  sources: SourceProvenance[];
}

/** One factor's contribution to a supplier's score. */
export interface MatchFactor {
  label: string;
  score: number;
  points: number;
  detail: string;
}

export interface SupplierMatch {
  supplier: string;
  supplier_iso3: string;
  /** 0..100, comparable only between suppliers for the same gap. */
  score: number;
  rank: number;
  transit_hours: number;
  distance_km: number | null;
  supplier_climate_risk: "low" | "medium" | "high" | null;
  importer_climate_risk: "low" | "medium" | "high" | null;
  complementary_months: string[];
  already_supplies_region: boolean;
  factors: MatchFactor[];
  rationale: string;
}

/** A sourcing gap with its ranked suppliers. */
export interface GapMatch {
  commodity: string;
  commodity_code: string;
  importer: string;
  importer_iso3: string;
  external_usd: number;
  external_share_pct: number;
  matches: SupplierMatch[];
  /** What the ranking deliberately did not weigh. */
  not_scored: string[];
}

/** One agent decision, in readable form. */
export interface AgentDecision {
  id: number;
  agent: string;
  action: string;
  confidence: number | null;
  created_at: string | null;
}

export interface GateDecisionRecord {
  id: number;
  decision: string;
  note: string | null;
  actor: string;
  created_at: string | null;
}

/** Whether an approved plan has anywhere to be delivered. */
export interface DispatchReadiness {
  status: "ready" | "unconfigured" | "unavailable";
  /** The OpenClaw dashboard session approved plans are posted into. */
  session: string | null;
  agent_id: string;
  /** The environment variables still unset, each with what it is for. */
  missing: { key: string; describes: string }[];
}

/** Everything the analysis page charts — all of it agent output. */
export interface AnalysisOverview {
  dispatch: DispatchReadiness;
  analyses: AnalysisResult[];
  decisions: AgentDecision[];
  gate_decisions: GateDecisionRecord[];
  matches: GapMatch[];
  sources: SourceProvenance[];
  generated_at: string;
}

export interface WorkflowResult {
  status: string;
  result: {
    status: string;
    thread_id: string;
    values: Record<string, unknown>[];
    updates: Record<string, Record<string, unknown>>[];
    interrupt?: Record<string, unknown>;
  };
}

// ── Interpretation layer ──────────────────────────────────────────────────

export type SourceStatus =
  | "live"
  | "cached"
  | "empty"
  | "pending"
  | "unauthorized"
  | "unavailable";

/**
 * Which upstream slot a provenance record came from.
 *
 * Stable and unique per publisher — unlike `source`, which Open-Meteo and the
 * NOAA hurricane feed share. Pages attribute against this.
 */
export type SourceSlot =
  | "indicators"
  | "trade"
  | "climate"
  | "storms"
  | "soil"
  | "agroclimate";

export interface SourceProvenance {
  slot: SourceSlot;
  source: string;
  publisher: string;
  endpoint: string;
  documentation: string;
  status: SourceStatus;
  fetched_at: string;
  covers?: string;
  note?: string;
  records: number;
}

export interface CoordinationSignal {
  kind:
    | "import_substitution"
    | "climate_exposure"
    | "production_alignment"
    | "logistics"
    | "data_gap";
  title: string;
  finding: string;
  recommendation: string;
  evidence: string[];
  confidence: "low" | "medium" | "high";
  states: string[];
}

export interface RegionalTotals {
  food_imports_usd: number;
  intra_caricom_usd: number;
  intra_caricom_share_pct: number | null;
  states_covered: number;
  trade_year: number | null;
}

export interface SignalsResponse {
  source: string;
  signals: CoordinationSignal[];
  note?: string;
  generated_at: string;
  sources: SourceProvenance[];
  totals: RegionalTotals;
}

export interface SoilProfile {
  country_iso3: string;
  country: string;
  ph: number | null;
  organic_carbon_g_per_kg: number | null;
  clay_pct: number | null;
  sand_pct: number | null;
  has_coverage: boolean;
  suitability: string;
}

export interface StateProfile {
  iso3: string;
  name: string;
  food_import_share_pct: number | null;
  arable_land_pct: number | null;
  agriculture_value_added_pct: number | null;
  population: number | null;
  food_imports_usd: number;
  intra_caricom_share_pct: number | null;
  climate_risk: "low" | "medium" | "high" | null;
  year: number | null;
  cereal_yield_kg_ha: number | null;
  cereal_land_ha: number | null;
  cereal_production_mt: number | null;
  cereal_production_year: number | null;
  agricultural_land_pct: number | null;
  soil: SoilProfile | null;
  rain_fed_months: string[];
}

export interface PlantingAlignment {
  commodity: string;
  importer: string;
  importer_iso3: string;
  supplier: string;
  supplier_iso3: string;
  complementary_months: string[];
  external_usd: number;
  note: string;
}

export interface SubstitutionOpportunity {
  commodity: string;
  commodity_code: string;
  importer: string;
  importer_iso3: string;
  external_usd: number;
  intra_usd: number;
  external_share_pct: number;
  regional_suppliers: string[];
  top_external_partners: string[];
}

// ── Logistics ─────────────────────────────────────────────────────────────

/**
 * One supplier→importer lane behind a substitution opportunity.
 *
 * Distance is real (great-circle between the two main ports); transit is an
 * estimate from a documented average sea speed plus port handling, and is
 * labelled as such. Nothing here is a carrier booking.
 */
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
  supplier_climate_risk: "low" | "medium" | "high" | null;
  importer_climate_risk: "low" | "medium" | "high" | null;
  /** Rolls the two ends up into one status for the lane. */
  status: "clear" | "watch" | "at_risk";
  /** Value this lane could displace from outside the region, USD. */
  external_usd: number;
}

/** A port's exposure — the platform observes weather, not congestion. */
export interface PortExposure {
  iso3: string;
  name: string;
  climate_risk: "low" | "medium" | "high" | null;
  /** Lanes that touch this port in either direction. */
  lanes: number;
  /** Trade value observed moving through this state, USD. */
  food_imports_usd: number;
  /** Capital or main port, so the console can place it on a map. */
  coordinates: [latitude: number, longitude: number] | null;
}

export interface LanesResponse {
  lanes: Lane[];
  ports: PortExposure[];
  active_storms: { name: string; classification: string; intensity_kt: number | null }[];
  /** What this endpoint cannot observe, stated rather than implied. */
  unobserved: string[];
  sources: SourceProvenance[];
  generated_at: string;
}

export interface PictureResponse {
  picture: {
    states: StateProfile[];
    totals: RegionalTotals;
    substitution_opportunities: SubstitutionOpportunity[];
    planting_alignment: PlantingAlignment[];
    agronomy: {
      states_with_soil_coverage: number;
      states_with_planting_calendar: number;
    };
    climate: {
      islands_at_risk: { island: string; country_iso3: string; risk: string; summary: string }[];
      active_storms: { name: string; classification: string; intensity_kt: number | null }[];
    };
    gaps: string[];
  };
  sources: SourceProvenance[];
}

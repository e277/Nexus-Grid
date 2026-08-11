export interface Farmer {
  id: number;
  name: string;
  island?: string | null;
  crops?: string | null;
  capacity?: number | null;
}

export interface Crop {
  id: number;
  farmer_id: number;
  crop_name: string;
  quantity: number;
  harvest_date?: string | null;
}

export interface Buyer {
  id: number;
  name: string;
  island?: string | null;
  buyer_type: "retailer" | "wholesaler" | "government";
  contact_email?: string | null;
}

export type DemandStatus = "open" | "matched" | "fulfilled" | "cancelled";

export interface Demand {
  id: number;
  buyer_id: number;
  crop_name: string;
  quantity: number;
  status: DemandStatus;
  needed_by?: string | null;
}

export type ShipmentStatus =
  | "planned"
  | "in_transit"
  | "delayed"
  | "delivered"
  | "cancelled";

export interface Shipment {
  id: number;
  crop_id: number;
  demand_id?: number | null;
  carrier?: string | null;
  origin_island: string;
  destination_island: string;
  quantity: number;
  status: ShipmentStatus;
  eta?: string | null;
}

export interface Carrier {
  id: number;
  name: string;
  mode: "sea" | "air" | "land";
  capacity?: number | null;
  home_island?: string | null;
  active: boolean;
}

export interface Warehouse {
  id: number;
  name: string;
  island: string;
  capacity?: number | null;
  cold_storage: boolean;
}

export type PortStatus = "open" | "congested" | "closed";

export interface Port {
  id: number;
  name: string;
  island: string;
  port_type: "sea" | "air";
  status: PortStatus;
}

export interface TradeRoute {
  id: number;
  name: string;
  origin_port_id: number;
  destination_port_id: number;
  mode: "sea" | "air";
  transit_hours?: number | null;
  active: boolean;
}

export type CustomsStatus = "draft" | "submitted" | "approved" | "rejected";

export interface CustomsDocument {
  id: number;
  shipment_id: number;
  document_type: string;
  status: CustomsStatus;
  reference_number?: string | null;
}

export interface WeatherEvent {
  id: number;
  event_type: string;
  severity: "low" | "medium" | "high" | "severe";
  affected_islands?: string | null;
}

export interface AgentActivity {
  id: number;
  agent_name: string;
  action: string;
  confidence?: number | null;
  created_at?: string | null;
}

export interface AuditLog {
  id: number;
  actor: string;
  action: string;
  entity_type?: string | null;
  entity_id?: number | null;
  created_at?: string | null;
}

export interface Health {
  status: string;
  app: string;
  version: string;
  environment: string;
}

export interface Overview {
  health: "healthy" | "strained" | "at_risk";
  counts: {
    farmers: number;
    buyers: number;
    crop_lots: number;
    total_inventory: number;
    open_demands: number;
    shipments: Record<string, number>;
    agent_activities: number;
  };
  food_security_gaps: {
    crop_name: string;
    open_demand: number;
    available_supply: number;
    gap: number;
  }[];
  active_hazards: number;
  ports_disrupted: number;
  explanation: string;
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

export type SourceStatus = "live" | "cached" | "empty" | "unauthorized" | "unavailable";

export interface SourceProvenance {
  source: string;
  publisher: string;
  endpoint: string;
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

export interface PictureResponse {
  picture: {
    states: StateProfile[];
    totals: RegionalTotals;
    substitution_opportunities: SubstitutionOpportunity[];
    climate: {
      islands_at_risk: { island: string; country_iso3: string; risk: string; summary: string }[];
      active_storms: { name: string; classification: string; intensity_kt: number | null }[];
    };
    gaps: string[];
  };
  sources: SourceProvenance[];
}

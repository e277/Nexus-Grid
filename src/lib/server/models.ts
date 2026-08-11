/**
 * Row shapes for the in-memory store.
 *
 * Dates are stored as strings in the shapes the API serializes them in:
 * calendar dates as `YYYY-MM-DD`, timestamps as ISO-8601 with a `Z` suffix.
 */

export type BuyerType = "retailer" | "wholesaler" | "government";
export type TransportMode = "sea" | "air" | "land";
export type PortType = "sea" | "air";
export type PortStatus = "open" | "congested" | "closed";
export type DemandStatus = "open" | "matched" | "fulfilled" | "cancelled";
export type ShipmentStatus =
  | "planned"
  | "in_transit"
  | "delayed"
  | "delivered"
  | "cancelled";
export type CustomsDocumentType =
  | "invoice"
  | "certificate_of_origin"
  | "phytosanitary"
  | "export_license";
export type CustomsStatus = "draft" | "submitted" | "approved" | "rejected";
export type WeatherEventType = "storm" | "hurricane" | "flood" | "drought";
export type WeatherSeverity = "low" | "medium" | "high" | "severe";

export interface Row {
  id: number;
}

export interface Farmer extends Row {
  name: string;
  island: string | null;
  crops: string | null;
  capacity: number | null;
}

export interface Crop extends Row {
  farmer_id: number;
  crop_name: string;
  quantity: number;
  harvest_date: string | null;
}

/** A commercial buyer of produce: retailer, wholesaler, or government. */
export interface Buyer extends Row {
  name: string;
  island: string | null;
  buyer_type: BuyerType;
  contact_email: string | null;
}

/** A buyer's request for a quantity of a crop by a given date. */
export interface Demand extends Row {
  buyer_id: number;
  crop_name: string;
  quantity: number;
  needed_by: string | null;
  status: DemandStatus;
  created_at: string | null;
}

/** A planned or in-flight movement of produce between islands. */
export interface Shipment extends Row {
  crop_id: number;
  demand_id: number | null;
  carrier: string | null;
  origin_island: string;
  destination_island: string;
  quantity: number;
  status: ShipmentStatus;
  departed_at: string | null;
  eta: string | null;
  delivered_at: string | null;
  created_at: string | null;
}

/** A transport provider moving goods between islands. */
export interface Carrier extends Row {
  name: string;
  mode: TransportMode;
  capacity: number | null;
  home_island: string | null;
  contact_email: string | null;
  active: boolean;
}

/** A storage facility, optionally cold-chain capable. */
export interface Warehouse extends Row {
  name: string;
  island: string;
  capacity: number | null;
  cold_storage: boolean;
}

/** A sea or air port through which shipments transit. */
export interface Port extends Row {
  name: string;
  island: string;
  port_type: PortType;
  status: PortStatus;
}

/** A recurring origin→destination lane between two ports. */
export interface TradeRoute extends Row {
  name: string;
  origin_port_id: number;
  destination_port_id: number;
  mode: PortType;
  transit_hours: number | null;
  active: boolean;
}

/** A climate hazard that may disrupt production or logistics. */
export interface WeatherEvent extends Row {
  event_type: WeatherEventType;
  severity: WeatherSeverity;
  affected_islands: string | null;
  starts_at: string | null;
  ends_at: string | null;
  source: string | null;
  created_at: string | null;
}

/** An export/import document attached to a shipment. */
export interface CustomsDocument extends Row {
  shipment_id: number;
  document_type: CustomsDocumentType;
  status: CustomsStatus;
  reference_number: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  created_at: string | null;
}

/** A record of an autonomous agent's action and its confidence. */
export interface AgentActivity extends Row {
  agent_name: string;
  action: string;
  confidence: number | null;
  /** JSON-encoded context the agent acted on */
  context: string | null;
  created_at: string | null;
}

/** An immutable trail of state-changing actions in the system. */
export interface AuditLog extends Row {
  /** user id, agent name, or "system" */
  actor: string;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  detail: string | null;
  created_at: string | null;
}

/**
 * Data access for every entity — the repository layer.
 *
 * A single generic factory covers get/list/create against an in-memory table,
 * which is all most entities need; the handful of entities with lifecycle
 * timestamps get an explicit status-update function below.
 */

import type {
  AgentActivity,
  AuditLog,
  Buyer,
  Carrier,
  Crop,
  CustomsDocument,
  CustomsStatus,
  Demand,
  DemandStatus,
  Farmer,
  Port,
  PortStatus,
  Row,
  Shipment,
  ShipmentStatus,
  TradeRoute,
  Warehouse,
  WeatherEvent,
} from "./models";
import { getDb, insert, type Table } from "./store";
import { utcnowIso } from "./time";

export interface ListOptions {
  skip?: number;
  limit?: number;
}

export interface Repository<T extends Row> {
  get(id: number): T | null;
  /** Rows matching every non-null filter, then offset/limit. */
  list(options?: ListOptions & Partial<Record<keyof T, unknown>>): T[];
  create(data: Omit<T, "id">): T;
  count(): number;
  all(): T[];
}

function createRepository<T extends Row>(select: () => Table<T>): Repository<T> {
  return {
    get(id) {
      return select().rows.find((row) => row.id === id) ?? null;
    },
    list(options = {}) {
      const { skip = 0, limit = 100, ...filters } = options;
      const entries = Object.entries(filters).filter(
        ([, value]) => value !== undefined && value !== null
      );
      const matches = select().rows.filter((row) =>
        entries.every(([field, value]) => row[field as keyof T] === value)
      );
      return matches.slice(skip, skip + limit);
    },
    create(data) {
      return insert(select(), data);
    },
    count() {
      return select().rows.length;
    },
    all() {
      return select().rows;
    },
  };
}

export const farmers = createRepository<Farmer>(() => getDb().farmers);
export const crops = createRepository<Crop>(() => getDb().crops);
export const buyers = createRepository<Buyer>(() => getDb().buyers);
export const demands = createRepository<Demand>(() => getDb().demands);
export const shipments = createRepository<Shipment>(() => getDb().shipments);
export const carriers = createRepository<Carrier>(() => getDb().carriers);
export const warehouses = createRepository<Warehouse>(() => getDb().warehouses);
export const ports = createRepository<Port>(() => getDb().ports);
export const tradeRoutes = createRepository<TradeRoute>(() => getDb().trade_routes);
export const weatherEvents = createRepository<WeatherEvent>(() => getDb().weather_events);
export const customsDocuments = createRepository<CustomsDocument>(
  () => getDb().customs_documents
);
export const agentActivities = createRepository<AgentActivity>(() => getDb().agent_activities);
export const auditLogs = createRepository<AuditLog>(() => getDb().audit_logs);

/** Move a shipment to `status`, stamping the matching lifecycle timestamp. */
export function updateShipmentStatus(shipment: Shipment, status: ShipmentStatus): Shipment {
  const now = utcnowIso();
  shipment.status = status;
  if (status === "in_transit" && shipment.departed_at === null) {
    shipment.departed_at = now;
  } else if (status === "delivered") {
    shipment.delivered_at = now;
  }
  return shipment;
}

export function updateDemandStatus(demand: Demand, status: DemandStatus): Demand {
  demand.status = status;
  return demand;
}

/** Move a document to `status`, stamping submission or decision time. */
export function updateDocumentStatus(
  document: CustomsDocument,
  status: CustomsStatus
): CustomsDocument {
  const now = utcnowIso();
  document.status = status;
  if (status === "submitted") {
    document.submitted_at = now;
  } else if (status === "approved" || status === "rejected") {
    document.decided_at = now;
  }
  return document;
}

export function updatePortStatus(port: Port, status: PortStatus): Port {
  port.status = status;
  return port;
}

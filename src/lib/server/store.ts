/**
 * In-memory data store: the tables, the id sequences, and the demo seed.
 *
 * State is process-local and held on `globalThis` so it survives Next.js hot reloads in development
 * and is shared by every route handler in the same Node.js process (which is
 * why handlers must not run on the Edge runtime).
 */

import type {
  AgentActivity,
  AuditLog,
  Buyer,
  Carrier,
  Crop,
  CustomsDocument,
  Demand,
  Farmer,
  Port,
  Row,
  Shipment,
  TradeRoute,
  Warehouse,
  WeatherEvent,
} from "./models";
import { dateOffsetIso, utcnowIso } from "./time";

export interface Table<T extends Row> {
  rows: T[];
  nextId: number;
}

export interface Database {
  farmers: Table<Farmer>;
  crops: Table<Crop>;
  buyers: Table<Buyer>;
  demands: Table<Demand>;
  shipments: Table<Shipment>;
  carriers: Table<Carrier>;
  warehouses: Table<Warehouse>;
  ports: Table<Port>;
  trade_routes: Table<TradeRoute>;
  weather_events: Table<WeatherEvent>;
  customs_documents: Table<CustomsDocument>;
  agent_activities: Table<AgentActivity>;
  audit_logs: Table<AuditLog>;
  seeded: boolean;
}

function table<T extends Row>(): Table<T> {
  return { rows: [], nextId: 1 };
}

function createDatabase(): Database {
  return {
    farmers: table<Farmer>(),
    crops: table<Crop>(),
    buyers: table<Buyer>(),
    demands: table<Demand>(),
    shipments: table<Shipment>(),
    carriers: table<Carrier>(),
    warehouses: table<Warehouse>(),
    ports: table<Port>(),
    trade_routes: table<TradeRoute>(),
    weather_events: table<WeatherEvent>(),
    customs_documents: table<CustomsDocument>(),
    agent_activities: table<AgentActivity>(),
    audit_logs: table<AuditLog>(),
    seeded: false,
  };
}

const globalStore = globalThis as typeof globalThis & { __nexusGridDb?: Database };

/** The single process-wide database instance. */
export function getDb(): Database {
  if (!globalStore.__nexusGridDb) {
    globalStore.__nexusGridDb = createDatabase();
  }
  return globalStore.__nexusGridDb;
}

/** Insert a row, assigning the next id for its table. Returns the stored row. */
export function insert<T extends Row>(tbl: Table<T>, data: Omit<T, "id">): T {
  const row = { ...data, id: tbl.nextId++ } as T;
  tbl.rows.push(row);
  return row;
}

/** Reset every table and re-seed. Used by tests and the dev reset path. */
export function resetDb(): Database {
  globalStore.__nexusGridDb = createDatabase();
  seedDemoData();
  return globalStore.__nexusGridDb;
}

/**
 * Create demo records once, while the store is still empty.
 *
 * Mirrors the walkthrough dataset the backend seeded at startup: three
 * farmers with harvested lots, three buyers with open demand, two shipments
 * in flight, two active hazards, and three ports (one congested).
 */
export function seedDemoData(): boolean {
  const db = getDb();
  if (db.farmers.rows.length > 0 || db.buyers.rows.length > 0) return false;

  const farmers = [
    { name: "Marlon Joseph", island: "Saint Lucia", crops: "banana,mango", capacity: 480 },
    { name: "Tanya Peters", island: "Dominica", crops: "tomato,pepper", capacity: 320 },
    { name: "Andre Lewis", island: "Trinidad", crops: "yam,banana", capacity: 410 },
  ].map((f) => insert(db.farmers, f));

  const crops = [
    { farmer_id: farmers[0].id, crop_name: "banana", quantity: 240, harvest_date: dateOffsetIso(-3) },
    { farmer_id: farmers[0].id, crop_name: "mango", quantity: 160, harvest_date: dateOffsetIso(-8) },
    { farmer_id: farmers[1].id, crop_name: "tomato", quantity: 180, harvest_date: dateOffsetIso(-2) },
    { farmer_id: farmers[2].id, crop_name: "yam", quantity: 220, harvest_date: dateOffsetIso(-10) },
  ].map((c) => insert(db.crops, c));

  const buyers = (
    [
      {
        name: "Caribbean Fresh Market",
        island: "Saint Lucia",
        buyer_type: "retailer",
        contact_email: "ops@caribbeanfresh.example",
      },
      {
        name: "Island Grocers",
        island: "Dominica",
        buyer_type: "wholesaler",
        contact_email: "replenishment@islandgrocers.example",
      },
      {
        name: "National Food Board",
        island: "Trinidad",
        buyer_type: "government",
        contact_email: "supply@foodboard.example",
      },
    ] as const
  ).map((b) => insert(db.buyers, { ...b }));

  const demands = (
    [
      { buyer_id: buyers[0].id, crop_name: "banana", quantity: 120, needed_by: dateOffsetIso(2), status: "open" },
      { buyer_id: buyers[1].id, crop_name: "tomato", quantity: 90, needed_by: dateOffsetIso(3), status: "open" },
      { buyer_id: buyers[2].id, crop_name: "yam", quantity: 70, needed_by: dateOffsetIso(5), status: "matched" },
    ] as const
  ).map((d) => insert(db.demands, { ...d, created_at: utcnowIso() }));

  (
    [
      {
        crop_id: crops[0].id,
        demand_id: demands[0].id,
        carrier: "SeaSpray Logistics",
        origin_island: "Saint Lucia",
        destination_island: "Dominica",
        quantity: 80,
        status: "planned",
      },
      {
        crop_id: crops[2].id,
        demand_id: demands[1].id,
        carrier: "Blue Harbor Air",
        origin_island: "Dominica",
        destination_island: "Trinidad",
        quantity: 60,
        status: "in_transit",
      },
    ] as const
  ).forEach((s) =>
    insert(db.shipments, {
      ...s,
      departed_at: null,
      eta: null,
      delivered_at: null,
      created_at: utcnowIso(),
    })
  );

  (
    [
      { event_type: "storm", severity: "high", affected_islands: "Dominica,Martinique", source: "CIMH" },
      { event_type: "flood", severity: "severe", affected_islands: "Saint Lucia", source: "NOAA" },
    ] as const
  ).forEach((e) =>
    insert(db.weather_events, { ...e, starts_at: null, ends_at: null, created_at: utcnowIso() })
  );

  (
    [
      { name: "Castries Wharf", island: "Saint Lucia", port_type: "sea", status: "open" },
      { name: "Roseau Terminal", island: "Dominica", port_type: "sea", status: "congested" },
      { name: "Piarco Air Cargo", island: "Trinidad", port_type: "air", status: "open" },
    ] as const
  ).forEach((p) => insert(db.ports, { ...p }));

  db.seeded = true;
  return true;
}

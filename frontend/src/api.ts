import { clearToken, getToken } from "./auth";
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
  Health,
  Overview,
  Port,
  PortStatus,
  Shipment,
  ShipmentStatus,
  TradeRoute,
  Warehouse,
  WeatherEvent,
  WorkflowResult,
} from "./types";

const BASE = "/api";

/** Thrown when the API rejects the token; the app returns to the login screen. */
export class UnauthorizedError extends Error {
  constructor() {
    super("Session expired");
  }
}

/** Thrown for 4xx responses that carry a detail message (403, 404, 409, 422). */
export class ApiError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    clearToken();
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : `${path} failed: ${response.status}`;
    throw new ApiError(response.status, detail);
  }
  return response.json() as Promise<T>;
}

const get = <T>(path: string) => request<T>("GET", path);
const post = <T>(path: string, body: unknown) => request<T>("POST", path, body);
const patch = <T>(path: string, body: unknown) => request<T>("PATCH", path, body);

export const api = {
  health: () => get<Health>("/health/"),
  me: () => get<{ email: string; role: string }>("/auth/me"),

  // Core domain
  farmers: () => get<Farmer[]>("/farmers/"),
  createFarmer: (body: Partial<Farmer>) => post<Farmer>("/farmers/", body),
  crops: () => get<Crop[]>("/crops/"),
  createCrop: (body: Partial<Crop>) => post<Crop>("/crops/", body),
  buyers: () => get<Buyer[]>("/buyers/"),
  createBuyer: (body: Partial<Buyer>) => post<Buyer>("/buyers/", body),
  demands: () => get<Demand[]>("/demands/"),
  createDemand: (body: Partial<Demand>) => post<Demand>("/demands/", body),
  setDemandStatus: (id: number, status: DemandStatus) =>
    patch<Demand>(`/demands/${id}/status`, { status }),
  shipments: () => get<Shipment[]>("/shipments/"),
  createShipment: (body: Partial<Shipment>) => post<Shipment>("/shipments/", body),
  setShipmentStatus: (id: number, status: ShipmentStatus) =>
    patch<Shipment>(`/shipments/${id}/status`, { status }),

  // Logistics network
  carriers: () => get<Carrier[]>("/carriers/"),
  createCarrier: (body: Partial<Carrier>) => post<Carrier>("/carriers/", body),
  warehouses: () => get<Warehouse[]>("/warehouses/"),
  createWarehouse: (body: Partial<Warehouse>) => post<Warehouse>("/warehouses/", body),
  ports: () => get<Port[]>("/ports/"),
  createPort: (body: Partial<Port>) => post<Port>("/ports/", body),
  setPortStatus: (id: number, status: PortStatus) =>
    patch<Port>(`/ports/${id}/status`, { status }),
  tradeRoutes: () => get<TradeRoute[]>("/trade-routes/"),
  createTradeRoute: (body: Partial<TradeRoute>) =>
    post<TradeRoute>("/trade-routes/", body),

  // Climate & customs
  weatherEvents: () => get<WeatherEvent[]>("/weather-events/"),
  createWeatherEvent: (body: Partial<WeatherEvent>) =>
    post<WeatherEvent>("/weather-events/", body),
  customsDocuments: () => get<CustomsDocument[]>("/customs-documents/"),
  createCustomsDocument: (body: Partial<CustomsDocument>) =>
    post<CustomsDocument>("/customs-documents/", body),
  setCustomsStatus: (id: number, status: CustomsStatus) =>
    patch<CustomsDocument>(`/customs-documents/${id}/status`, { status }),

  // Intelligence
  overview: () => get<Overview>("/intelligence/overview"),
  demandForecast: (crop: string) =>
    get<Record<string, unknown>>(`/intelligence/demand-forecast/${encodeURIComponent(crop)}`),
  spoilage: (cropId: number) =>
    get<Record<string, unknown>>(`/intelligence/spoilage/${cropId}`),
  transportDelay: (origin: string, destination: string) =>
    get<Record<string, unknown>>(
      `/intelligence/transport-delay?origin_island=${encodeURIComponent(origin)}&destination_island=${encodeURIComponent(destination)}`
    ),
  shortage: (crop: string) =>
    get<Record<string, unknown>>(`/intelligence/shortage/${encodeURIComponent(crop)}`),

  // Orchestration & observability
  triggerWorkflow: (body: Record<string, unknown>) =>
    post<WorkflowResult>("/workflow/trigger", body),
  agentActivities: () => get<AgentActivity[]>("/agent-activities/?limit=25"),
  auditLogs: () => get<AuditLog[]>("/audit-logs/?limit=25"),
};

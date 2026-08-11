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
  PictureResponse,
  SignalsResponse,
  SourceProvenance,
} from "./types";

const BASE = "/api";

/** Thrown for 4xx responses that carry a detail message (404, 409, 422). */
export class ApiError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

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

function buildPath(path: string, params?: Record<string, string | number | boolean | undefined>) {
  if (!params) return path;

  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");

  return query ? `${path}${path.includes("?") ? "&" : "?"}${query}` : path;
}

export const api = {
  health: () => get<Health>("/health"),

  // Interpretation layer — upstream sources, the derived picture, and signals
  sources: () => get<{ sources: SourceProvenance[] }>("/sources"),
  refreshSources: () => post<{ status: string }>("/sources/refresh", {}),
  picture: (refresh = false) =>
    get<PictureResponse>(`/picture${refresh ? "?refresh=true" : ""}`),
  signals: (refresh = false) =>
    get<SignalsResponse>(`/signals${refresh ? "?refresh=true" : ""}`),

  // Core domain
  farmers: (params?: { skip?: number; limit?: number }) =>
    get<Farmer[]>(buildPath("/farmers", params)),
  getFarmer: (id: number) => get<Farmer>(`/farmers/${id}`),
  createFarmer: (body: Partial<Farmer>) => post<Farmer>("/farmers", body),
  crops: (params?: { skip?: number; limit?: number }) =>
    get<Crop[]>(buildPath("/crops", params)),
  getCrop: (id: number) => get<Crop>(`/crops/${id}`),
  createCrop: (body: Partial<Crop>) => post<Crop>("/crops", body),
  buyers: (params?: { skip?: number; limit?: number }) =>
    get<Buyer[]>(buildPath("/buyers", params)),
  getBuyer: (id: number) => get<Buyer>(`/buyers/${id}`),
  createBuyer: (body: Partial<Buyer>) => post<Buyer>("/buyers", body),
  demands: (params?: { skip?: number; limit?: number; status?: DemandStatus }) =>
    get<Demand[]>(buildPath("/demands", params)),
  getDemand: (id: number) => get<Demand>(`/demands/${id}`),
  createDemand: (body: Partial<Demand>) => post<Demand>("/demands", body),
  setDemandStatus: (id: number, status: DemandStatus) =>
    patch<Demand>(`/demands/${id}/status`, { status }),
  shipments: (params?: { skip?: number; limit?: number; status?: ShipmentStatus }) =>
    get<Shipment[]>(buildPath("/shipments", params)),
  getShipment: (id: number) => get<Shipment>(`/shipments/${id}`),
  createShipment: (body: Partial<Shipment>) => post<Shipment>("/shipments", body),
  setShipmentStatus: (id: number, status: ShipmentStatus) =>
    patch<Shipment>(`/shipments/${id}/status`, { status }),

  // Logistics network
  carriers: (params?: { skip?: number; limit?: number; active?: boolean }) =>
    get<Carrier[]>(buildPath("/carriers", params)),
  getCarrier: (id: number) => get<Carrier>(`/carriers/${id}`),
  createCarrier: (body: Partial<Carrier>) => post<Carrier>("/carriers", body),
  warehouses: (params?: { skip?: number; limit?: number; island?: string }) =>
    get<Warehouse[]>(buildPath("/warehouses", params)),
  getWarehouse: (id: number) => get<Warehouse>(`/warehouses/${id}`),
  createWarehouse: (body: Partial<Warehouse>) => post<Warehouse>("/warehouses", body),
  ports: (params?: { skip?: number; limit?: number; status?: PortStatus }) =>
    get<Port[]>(buildPath("/ports", params)),
  getPort: (id: number) => get<Port>(`/ports/${id}`),
  createPort: (body: Partial<Port>) => post<Port>("/ports", body),
  setPortStatus: (id: number, status: PortStatus) =>
    patch<Port>(`/ports/${id}/status`, { status }),
  tradeRoutes: (params?: { skip?: number; limit?: number; active?: boolean }) =>
    get<TradeRoute[]>(buildPath("/trade-routes", params)),
  getTradeRoute: (id: number) => get<TradeRoute>(`/trade-routes/${id}`),
  createTradeRoute: (body: Partial<TradeRoute>) =>
    post<TradeRoute>("/trade-routes", body),

  // Climate & customs
  weatherEvents: (params?: { skip?: number; limit?: number; severity?: string }) =>
    get<WeatherEvent[]>(buildPath("/weather-events", params)),
  getWeatherEvent: (id: number) => get<WeatherEvent>(`/weather-events/${id}`),
  createWeatherEvent: (body: Partial<WeatherEvent>) =>
    post<WeatherEvent>("/weather-events", body),
  customsDocuments: (params?: { skip?: number; limit?: number; shipment_id?: number; status?: CustomsStatus }) =>
    get<CustomsDocument[]>(buildPath("/customs-documents", params)),
  getCustomsDocument: (id: number) => get<CustomsDocument>(`/customs-documents/${id}`),
  createCustomsDocument: (body: Partial<CustomsDocument>) =>
    post<CustomsDocument>("/customs-documents", body),
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
  workflowStatus: () => get<{ workflow: string; status: string }>("/workflow/status"),
  triggerWorkflow: (body: Record<string, unknown>) =>
    post<WorkflowResult>("/workflow/trigger", body),
  resumeWorkflow: (threadId: string, decision: "approved" | "rejected") =>
    post<WorkflowResult>(`/workflow/${threadId}/resume`, { decision }),
  agentActivities: (params?: { skip?: number; limit?: number; agent_name?: string }) =>
    get<AgentActivity[]>(buildPath("/agent-activities", params)),
  auditLogs: (params?: { skip?: number; limit?: number; actor?: string; entity_type?: string }) =>
    get<AuditLog[]>(buildPath("/audit-logs", params)),
};

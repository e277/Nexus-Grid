import type {
  AgentActivity,
  AuditLog,
  GateDecision,
  Health,
  LanesResponse,
  PictureResponse,
  SignalsResponse,
  SourceProvenance,
  WorkflowResult,
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

  // Upstream sources, the derived picture, and the interpreted signals
  sources: () => get<{ sources: SourceProvenance[] }>("/sources"),
  refreshSources: () => post<{ status: string }>("/sources/refresh", {}),
  picture: (refresh = false) =>
    get<PictureResponse>(`/picture${refresh ? "?refresh=true" : ""}`),
  signals: (refresh = false) =>
    get<SignalsResponse>(`/signals${refresh ? "?refresh=true" : ""}`),
  lanes: () => get<LanesResponse>("/lanes"),

  // Orchestration & observability
  workflowStatus: () => get<{ workflow: string; status: string }>("/workflow/status"),
  triggerWorkflow: (body: Record<string, unknown>) =>
    post<WorkflowResult>("/workflow/trigger", body),
  resumeWorkflow: (threadId: string, decision: GateDecision, note?: string | null) =>
    post<WorkflowResult>(`/workflow/${threadId}/resume`, { decision, note: note ?? null }),
  agentActivities: (params?: { skip?: number; limit?: number; agent_name?: string }) =>
    get<AgentActivity[]>(buildPath("/agent-activities", params)),
  auditLogs: (params?: { skip?: number; limit?: number; actor?: string; entity_type?: string }) =>
    get<AuditLog[]>(buildPath("/audit-logs", params)),
};

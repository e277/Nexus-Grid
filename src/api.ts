import type {
  AgentActivity,
  AnalysisDomain,
  AnalysisResponse,
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

/** One server-sent event from a streamed run. */
export interface StreamEvent {
  event: "started" | "node" | "finished" | "failed";
  data: Record<string, unknown>;
}

/**
 * Read `/api/workflow/stream` as it arrives.
 *
 * `fetch` rather than `EventSource` because the run has to be POSTed — the
 * signal, or the gate decision, is the request body, and EventSource is
 * GET-only.
 */
export async function* streamWorkflow(
  body: Record<string, unknown>,
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  const response = await fetch(`${BASE}/workflow/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      typeof payload?.detail === "string" ? payload.detail : "Failed to start the run"
    );
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;

      // SSE frames are separated by a blank line; anything after the last one
      // is a partial frame and stays in the buffer.
      let split = buffer.indexOf("\n\n");
      while (split !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        split = buffer.indexOf("\n\n");

        let name = "message";
        const dataLines: string[] = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) name = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (dataLines.length === 0) continue;
        try {
          yield { event: name as StreamEvent["event"], data: JSON.parse(dataLines.join("\n")) };
        } catch {
          // A frame we cannot parse is skipped rather than killing the run.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
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

  /** One agent's reading of one domain — what every intelligence page renders. */
  analysis: (domain: AnalysisDomain, refresh = false) =>
    get<AnalysisResponse>(`/analysis/${domain}${refresh ? "?refresh=true" : ""}`),

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

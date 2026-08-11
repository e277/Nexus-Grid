/**
 * Shared plumbing for the route handlers.
 *
 * `api()` is where the cross-cutting concerns live: it rate-limits, records
 * metrics, resolves route params, writes the audit trail for state changes,
 * and turns a thrown error into the `{ "detail": ... }` JSON body the client
 * knows how to read.
 */

import { ensureBootstrapped } from "./bootstrap";
import { recordRequest, routeTemplate } from "./metrics";
import { allow, clientAddress } from "./rate-limit";
import { recordAudit } from "./services/activity";
import { ConflictError, NotFoundError } from "./services/errors";

/** An error carrying the HTTP status the client should see. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers?: Record<string, string>
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface RouteContext<P> {
  request: Request;
  params: P;
  /** Query string parameters, already parsed. */
  query: URLSearchParams;
}

type Handler<P> = (context: RouteContext<P>) => unknown | Promise<unknown>;

interface Options {
  /** Status for a successful JSON response (201 for creates). */
  status?: number;
}

function jsonResponse(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/**
 * Who to attribute a state change to.
 *
 * There is no user model here — this is a coordination layer, and the system
 * integrating it owns identity. An `X-Actor` header lets that system carry its
 * own attribution into the audit trail; otherwise changes are `system`.
 */
function actorFrom(request: Request): string {
  return request.headers.get("x-actor")?.trim() || "system";
}

/**
 * Name a state change from its route, e.g. `POST /api/demands` →
 * `demands.created`, `PATCH /api/ports/{id}/status` → `ports.status_changed`.
 */
function auditAction(method: string, path: string): { entityType: string; action: string } | null {
  if (method !== "POST" && method !== "PATCH") return null;

  const segments = path.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const entityType = segments[0];
  if (!entityType) return null;

  const tail = segments[segments.length - 1];
  if (tail === "status") return { entityType, action: `${entityType}.status_changed` };
  if (tail === entityType) return { entityType, action: `${entityType}.created` };
  return { entityType, action: `${entityType}.${tail}` };
}

function recordStateChange(request: Request, path: string, result: unknown): void {
  const named = auditAction(request.method, path);
  if (named === null) return;

  const id = (result as { id?: unknown })?.id;
  recordAudit({
    actor: actorFrom(request),
    action: named.action,
    entityType: named.entityType,
    entityId: typeof id === "number" ? id : null,
  });
}

/**
 * Wrap a handler as a Next.js route handler.
 *
 * The handler returns a plain value (serialized to JSON) or its own
 * `Response` when it needs to control the content type.
 */
export function api<P = Record<string, string>>(handler: Handler<P>, options: Options = {}) {
  return async (
    request: Request,
    context?: { params?: Promise<P> }
  ): Promise<Response> => {
    ensureBootstrapped();

    const started = performance.now();
    const url = new URL(request.url);
    const path = routeTemplate(url.pathname);

    const finish = (response: Response): Response => {
      recordRequest(request.method, path, response.status, (performance.now() - started) / 1000);
      return response;
    };

    if (!allow(clientAddress(request))) {
      return finish(
        jsonResponse({ detail: "Rate limit exceeded. Try again shortly." }, 429, {
          "Retry-After": "60",
        })
      );
    }

    try {
      const params = ((await context?.params) ?? {}) as P;
      const result = await handler({ request, params, query: url.searchParams });

      if (result instanceof Response) return finish(result);

      recordStateChange(request, path, result);
      return finish(jsonResponse(result, options.status ?? 200));
    } catch (error) {
      if (error instanceof HttpError) {
        return finish(jsonResponse({ detail: error.message }, error.status, error.headers));
      }
      if (error instanceof NotFoundError) {
        return finish(jsonResponse({ detail: error.message }, 404));
      }
      if (error instanceof ConflictError) {
        return finish(jsonResponse({ detail: error.message }, 409));
      }
      console.error("Unhandled error in route handler", error);
      return finish(jsonResponse({ detail: "Internal server error" }, 500));
    }
  };
}

/** Parse a JSON request body, rejecting anything that is not an object. */
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new HttpError(422, "Request body must be valid JSON");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(422, "Request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

/** Read `skip`/`limit` pagination. */
export function pagination(query: URLSearchParams): { skip: number; limit: number } {
  const skip = Number.parseInt(query.get("skip") ?? "", 10);
  const limit = Number.parseInt(query.get("limit") ?? "", 10);
  return {
    skip: Number.isFinite(skip) && skip >= 0 ? skip : 0,
    limit: Number.isFinite(limit) && limit >= 0 ? limit : 100,
  };
}

/** Parse a numeric path parameter, 422 if it is not an integer. */
export function intParam(value: string | undefined, name: string): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(422, `${name} must be an integer`);
  }
  return parsed;
}

/** Read an optional enum-valued query parameter, 422 on an unknown value. */
export function enumQuery<T extends string>(
  query: URLSearchParams,
  name: string,
  allowed: readonly T[]
): T | null {
  const value = query.get(name);
  if (value === null || value === "") return null;
  if (!allowed.includes(value as T)) {
    throw new HttpError(422, `${name} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

/** Read an optional boolean query parameter. */
export function boolQuery(query: URLSearchParams, name: string): boolean | null {
  const value = query.get(name);
  if (value === null || value === "") return null;
  return ["1", "true", "yes"].includes(value.toLowerCase());
}

/** Throw a 404 when a lookup came back empty. */
export function found<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new HttpError(404, message);
  return value;
}

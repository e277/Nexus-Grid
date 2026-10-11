/**
 * Shared plumbing for the route handlers.
 *
 * `api()` is where the cross-cutting concerns live: it rate-limits, checks the
 * caller's identity and role, records metrics, resolves route params, writes
 * the audit trail for state changes, and turns a thrown error into the
 * `{ "detail": ... }` JSON body the client knows how to read.
 */

import { identify, type Principal } from "./auth/identity";
import { satisfies, type Role } from "./auth/policy";
import { ensureBootstrapped } from "./bootstrap";
import { recordRequest, routeTemplate } from "./metrics";
import { allow, clientAddress } from "./rate-limit";
import { recordAudit } from "./observability/activity";

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
  /** The authenticated caller; null only on a `public` route. */
  principal: Principal | null;
  params: P;
  /** Query string parameters, already parsed. */
  query: URLSearchParams;
}

type Handler<P> = (context: RouteContext<P>) => unknown | Promise<unknown>;

/**
 * Who may call a route: anyone (`public`, for probes), or a caller holding at
 * least this role.
 */
export type Access = "public" | Role;

interface Options {
  /**
   * Defaults to `viewer` for reads and `operator` for anything that changes
   * state, so a new route is never open by omission.
   */
  access?: Access;
  /** Status for a successful JSON response (201 for creates). */
  status?: number;
  /**
   * Refine the audited action from the handler's result.
   *
   * The route path alone names most state changes well enough, but not one
   * whose meaning is in the body — an approval gate resolved four different
   * ways is four different events, and all of them are `POST …/resume`.
   */
  audit?: (result: unknown) => { action?: string; detail?: string } | null;
}

function jsonResponse(body: unknown, status: number, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function defaultAccess(method: string): Access {
  return method === "GET" || method === "HEAD" ? "viewer" : "operator";
}

/**
 * Resolve the caller and check their role.
 *
 * 401 when nobody is signed in, 403 when someone is but their role does not
 * cover the route — the client signs the first out and explains the second.
 */
export async function authorize(request: Request, access: Access): Promise<Principal | null> {
  if (access === "public") return null;
  const principal = await identify(request);
  if (!principal) {
    throw new HttpError(401, "Sign in to continue.", { "WWW-Authenticate": "Bearer" });
  }
  if (!satisfies(principal.role, access)) {
    throw new HttpError(403, `This action needs the ${access} role; you are signed in as ${principal.role}.`);
  }
  return principal;
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

async function recordStateChange(
  request: Request,
  principal: Principal | null,
  path: string,
  result: unknown,
  refine: Options["audit"]
): Promise<void> {
  const named = auditAction(request.method, path);
  if (named === null) return;

  const override = refine?.(result) ?? null;
  const id = (result as { id?: unknown })?.id;
  await recordAudit({
    // The verified caller, never a client-supplied header: an audit trail a
    // caller can write their own name into is not an audit trail.
    actor: principal?.id ?? "system",
    action: override?.action ?? named.action,
    entityType: named.entityType,
    entityId: typeof id === "number" ? id : null,
    detail: override?.detail ?? null,
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
      const principal = await authorize(request, options.access ?? defaultAccess(request.method));
      const params = ((await context?.params) ?? {}) as P;
      const result = await handler({ request, principal, params, query: url.searchParams });

      if (result instanceof Response) return finish(result);

      // Awaited: a state change is not reported as done until its audit row
      // is written. If that write fails the change has still happened, so the
      // caller gets a 500 rather than a success the trail cannot back up.
      await recordStateChange(request, principal, path, result, options.audit);
      return finish(jsonResponse(result, options.status ?? 200));
    } catch (error) {
      if (error instanceof HttpError) {
        return finish(jsonResponse({ detail: error.message }, error.status, error.headers));
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

/** Read an optional boolean query parameter. */
export function boolQuery(query: URLSearchParams, name: string): boolean | null {
  const value = query.get(name);
  if (value === null || value === "") return null;
  return ["1", "true", "yes"].includes(value.toLowerCase());
}

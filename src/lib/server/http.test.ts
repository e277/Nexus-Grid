import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Principal } from "./auth/identity";

const identity = vi.hoisted(() => ({ current: null as Principal | null }));

vi.mock("./auth/identity", () => ({ identify: async () => identity.current }));
// The wrapper warms the agent runtime on first call; nothing here needs it.
vi.mock("./bootstrap", () => ({ ensureBootstrapped: () => {} }));

const { api } = await import("./http");
const { listAuditLogs } = await import("./observability/activity");

function call(method: string, path: string, handler = api(() => ({ ok: true }))) {
  return handler(new Request(`http://localhost${path}`, { method, headers: { "x-actor": "spoofed" } }));
}

describe("api() access control", () => {
  beforeEach(() => {
    identity.current = null;
  });

  it("refuses an anonymous caller with 401", async () => {
    const response = await call("GET", "/api/signals");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ detail: "Sign in to continue." });
  });

  it("lets a public route through without a caller", async () => {
    const response = await call("GET", "/api/health", api(() => ({ ok: true }), { access: "public" }));
    expect(response.status).toBe(200);
  });

  it("lets a viewer read but not change state", async () => {
    identity.current = { id: "analyst@example.org", role: "viewer", kind: "user" };
    expect((await call("GET", "/api/signals")).status).toBe(200);
    expect((await call("POST", "/api/sources/refresh")).status).toBe(403);
  });

  it("holds admin routes above operators", async () => {
    identity.current = { id: "ops@coop.tt", role: "operator", kind: "user" };
    const metrics = api(() => ({ ok: true }), { access: "admin" });
    expect((await call("GET", "/api/metrics", metrics)).status).toBe(403);
  });

  it("audits a state change under the verified caller, not X-Actor", async () => {
    identity.current = { id: "ops@coop.tt", role: "operator", kind: "user" };
    expect((await call("POST", "/api/sources/refresh")).status).toBe(200);
    const [latest] = listAuditLogs({ limit: 1 });
    expect(latest.actor).toBe("ops@coop.tt");
    expect(latest.action).toBe("sources.refresh");
  });
});

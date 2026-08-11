# Nexus-Grid — Architecture & Reference

How the application's pieces connect at runtime — the operator console,
rule-based agents, the workflow graph, LLM integration, and the external
data providers — plus what's still outstanding. Consolidates what were
previously `model_connections.md` and `development_master_prompt.md`
(the latter was the original phase-by-phase build brief; its still-relevant
parts live on in §9 below, the rest is superseded by this doc reflecting
what's actually built).

> **Stack note.** This was originally a two-service system: a React (Vite)
> frontend and a Python FastAPI backend with SQLAlchemy/Postgres, LangGraph,
> and a Uvicorn agent loop. It is now a **single Next.js application** — the
> agents, workflow, services, and integrations were ported to TypeScript under
> `src/lib/server/` and are exposed through route handlers under `src/app/api/`.
> The design below is unchanged; only the host language and the persistence
> layer differ. Points where the port genuinely behaves differently are called
> out inline.

## 1. Big Picture

Nexus-Grid is a single deployable with a clear internal split:

```
React operator console (src/app, src/views, src/components)
        │  REST + JWT (src/api.ts / src/auth.ts)
        ▼
Route handlers (src/app/api/**/route.ts)
   ├── Domain APIs (farmers, crops, buyers, shipments, logistics, climate, customs)
   ├── Event bus (in-process) → SupervisorAgent → specialist agents
   ├── Workflow graph (/api/workflow) → one LLM call (MiniMax, direct HTTP)
   │      + real human-in-the-loop pause/resume at the approval gate
   ├── External data providers (weather, routing, pricing) → real sources
   └── Background SupplyAgent poll loop
        ▼
In-memory store (src/lib/server/store.ts), demo-seeded at startup
```

There are three layers of "intelligence," connected through an event bus and
the workflow graph. Only one of them calls a real LLM; a separate layer
(§7) calls real external data sources.

Every route handler declares `runtime = "nodejs"`, because the store, the agent
loop, and the workflow checkpointer are process-local singletons held on
`globalThis` — the Edge runtime would give each request its own module instance.

## 2. The LLM Connection

The only place a model is invoked is `src/lib/server/workflows/llm-recommend.ts`:

- `recommendSupplyResponse()` builds a prompt from supply-chain context (crop, quantity, farmer, island, market/weather/demand/logistics signals) and POSTs it directly to **MiniMax**'s OpenAI-compatible chat completions endpoint via `fetch`.
- The request goes to `{MINIMAX_BASE_URL}/chat/completions` with `Authorization: Bearer {MINIMAX_API_KEY}`, model `MINIMAX_MODEL` (default `MiniMax-M2`, a reasoning model — responses include a `<think>...</think>` block the frontend strips out for display).
- Keys/URLs come from the environment or `.env.local` (see `src/lib/server/config.ts`).
- **Graceful degradation**: if `MINIMAX_API_KEY` is unset, or the HTTP call fails for any reason (network, auth, timeout), the function returns a `{"source": "stub"|"error", ...}` payload instead of throwing, so the workflow keeps running without an LLM.

### OpenClaw / cmdop

OpenClaw is an *agent runtime* client (a themed wrapper over the `cmdop` SDK), **not** a chat model. It ships as a Python package only and has no JavaScript equivalent, so `openclawRuntimeStatus()` now returns `unavailable` unconditionally — the port cannot load it, and says so rather than implying otherwise. That status still feeds the `execute` node's `dispatch_mode` (`"openclaw"` vs `"simulated"`), which is therefore always `"simulated"` today, so the UI never implies a real dispatch happened when it didn't. (Under Python it was equally `"simulated"` in practice: no `CMDOP_API_KEY` was ever configured — none was provided among this project's buildathon resources.)

## 3. The Workflow Graph

`src/lib/server/workflows/supply-chain-graph.ts` implements the control loop as a stateful graph:

```
perceive → assess → recommend → plan → (approval gate) → execute → monitor → recover
                                              │                                  │
                                          hold (interrupt)              assess ◄── re-plan (max 1×)
```

- **State** is a `SupplyState` object; each node returns only the keys it updates and the runtime merges them.
- **The runtime is local.** `workflows/graph.ts` is a ~200-line replacement for LangGraph covering exactly what this project used: node registration, plain and conditional edges, a checkpointer keyed by thread id, and `interrupt()`. Nothing else about the graph changed.
- **`recommend` is the only LLM node** — it calls `recommendAction` (which wraps `recommendSupplyResponse`) with up to 3 retries for transient failures. Every other node is deterministic, driven by `src/lib/server/services/supply-rules.ts`.
- **Real human-in-the-loop approval gate**: when `require_approval` is set and the plan's priority is `high`/`urgent`, `holdForApproval` calls `interrupt()` — this genuinely pauses graph execution (not just a status label) and checkpoints the state from *before* that node. `POST /api/workflow/trigger`'s response reports `"status": "awaiting_approval"` with the interrupt payload, and `updates` stops after `plan`. A human decides via `POST /api/workflow/{threadId}/resume` (`{"decision": "approved"|"rejected"}`), which resumes the same thread: the `hold` node re-runs from the top and `interrupt()` returns the decision instead of pausing again, then execution continues into `recover`.
- **Re-planning**: `monitor` detects disruption (severe weather or constrained logistics) and loops back to `assess` at most `MAX_REPLANS = 1` time.
- **Checkpointing**: required for `interrupt()`/resume to work at all. The port has one backend, `MemoryCheckpointer` (the Python `sqlite`/`postgres` options are gone with the database). Runs are inspectable and resumable by thread id.
- Exposed via the workflow routes: `GET /api/workflow/status`, `POST /api/workflow/trigger`, `POST /api/workflow/{threadId}/resume`.

## 4. The Rule-Based Agent Layer

`src/lib/server/agents/` contains deterministic agents (no LLM calls):

- **`BaseAgent`** (`base.ts`) defines the contract: `handle(payload) → AgentResult` (action + confidence 0..1 + rationale + outputs), a bounded in-memory list of the last 50 results, per-agent logging, and persistence of every decision as an agent-activity row for auditing.
- **`SupplyAgent`** (`supply.ts`) confidence is *computed*, not hardcoded: it's a function of how many crops were scanned, how many were anomalous, and — for crops classified as "normal" — how close their quantity sits to the surplus/shortage thresholds (`services/supply-rules.ts`). More corroborating signal and clearer margins from the threshold both raise confidence.
- **`SupervisorAgent`** (`supervisor.ts`) is the single dispatch point. A routing table maps events to specialists:
  | Event | Specialist |
  | --- | --- |
  | `buyer.request.created`, `crop.harvest.ready` | DemandIntelligenceAgent |
  | `weather.alert` | ClimateRiskAgent |
  | `shipment.delayed`, `customs.approved` | LogisticsAgent |
  | `shipment.departed` | CustomsAgent |
- **`SupplyAgent` poll loop** (`runner.ts`): started on the first request into a fresh process (unless `SKIP_AGENT_STARTUP`), it scans inventory every `AGENT_POLL_INTERVAL_SECONDS` (default 10s) and opens a workflow run for each anomaly. The timer is `unref`'d so it never holds the process open on its own.

## 5. The Event Bus (Glue)

`src/lib/server/events.ts` provides the bus that connects domain activity to the agents:

- `EventBus` is an in-process publish/subscribe dispatcher — the only backend. Handlers are awaited in order, so an agent's reaction completes before the request that triggered it returns.
- `registerEventHandlers()` runs once at bootstrap and subscribes the supervisor to every supervised event; handlers dispatch into `supervisor.dispatch(event, payload)`.

## 6. Data & Security Layers

- **Store** (`store.ts`, `models.ts`, `repositories.ts`): the same 14 entities — farmers, crops, buyers, demands, shipments, carriers, warehouses, ports, trade routes, weather events, customs documents, users, plus agent activities and audit logs — as typed rows in an in-memory store with per-table id sequences. A demo dataset is seeded while the store is still empty, exactly as the Python service seeded Postgres on startup. **State does not survive a restart**; swapping `store.ts` for a real database is the only change needed to persist.
- **Auth** (`security.ts`): every route except `/api`, `/api/health/*`, `/api/metrics`, and `/api/auth/*` requires a JWT (`getCurrentUser`); observability routes (`/api/agent-activities`, `/api/audit-logs`) and `/api/workflow/*` additionally require the `government` role (`admin` bypasses every role check). Passwords are PBKDF2-HMAC-SHA256 (390k iterations) and tokens are HS256 JWTs — the same encodings the Python used, via `node:crypto`.
- **Cross-cutting concerns** (`http.ts`): request metrics and rate limiting (in-process, memory-backed sliding window) run in the shared route wrapper rather than as middleware, so they share a process with the store instead of living on the Edge runtime.

## 7. External Data Providers

`src/lib/server/integrations/interfaces.ts` defines three interfaces (`WeatherProvider`, `RoutingProvider`, `PricingProvider`) so adapters can swap without touching callers (`services/intelligence.ts`). Each has a `stub` (deterministic hash, labeled `"source": "stub"`, still registered for tests) and a **real** default:

| Interface | Real adapter | Source | Notes |
| --- | --- | --- | --- |
| Weather | `OpenMeteoWeatherProvider` (`weather-live.ts`) | [Open-Meteo](https://open-meteo.com) (forecast) + [NOAA NHC](https://www.nhc.noaa.gov/CurrentStorms.json) (active storms) | Both free, keyless, live. Risk derived from real windspeed/precipitation thresholds. |
| Routing | `GeoRoutingProvider` (`routing-geo.ts`) | Haversine distance over real island coordinates (`geo.ts`) | No free live inter-island freight API exists; this is a real geography-based estimate, labeled `"source": "geo-estimate"`, not a live carrier feed. |
| Pricing | `ReferencePricingProvider` (`pricing-reference.ts`) | Static Caribbean wholesale reference table + real crop-seasonality trend | FAOSTAT's live API was unreachable (HTTP 521) when checked and is a poor fit for a synchronous request path regardless; base price is a labeled snapshot (`price_as_of`), trend is derived from real Caribbean harvest-season calendars against the current month, not random. |

Every real adapter catches network/timeout/lookup failures internally and falls back to the stub — callers always get a usable response, honestly labeled by `source`. See `docs/buildathon_resources.md` for more real-data sources if further providers get built out (trade volumes, production stats, etc.).

## 8. End-to-End Flows

**Event-driven (rules only):**

1. A domain route writes data (e.g. a shipment is marked delayed) and publishes `shipment.delayed`.
2. The event bus delivers it to a handler, which calls the SupervisorAgent.
3. The supervisor routes to the LogisticsAgent, whose decision is logged, remembered, and persisted as an agent-activity row.

**Workflow-driven (includes the LLM, autonomous except at the approval gate):**

1. A client POSTs to `/api/workflow/trigger` with a supply signal.
2. The graph runs perceive → assess, classifying supply risk from quantity.
3. `recommend` calls MiniMax (or returns a stub without a key).
4. `plan` builds a concrete action.
5. Non-urgent plans proceed straight to `execute`; urgent plans genuinely pause at `hold` (§3) until `POST /api/workflow/{threadId}/resume` supplies a decision — the only point a run isn't autonomous.
6. `execute` → `monitor` (may re-plan once on disruption) → `recover`, with the full state history checkpointed per thread id.

## 9. Configuration Summary

All settings live in `src/lib/server/config.ts` (env vars / `.env.local`):

| Variable | Purpose | Default |
| --- | --- | --- |
| `MINIMAX_API_KEY` | Enables the LLM recommendation step | empty (stub mode) |
| `MINIMAX_BASE_URL` | MiniMax's OpenAI-compatible endpoint | `https://api.minimax.io/v1` |
| `MINIMAX_MODEL` | MiniMax model id to call | `MiniMax-M2` |
| `SHO_API_KEY` / `SHO_BASE_URL` / `SHO_MODEL` | Alternative OpenAI-compatible provider, used when MiniMax is unset | empty |
| `SKIP_AGENT_STARTUP` | Disable the SupplyAgent poll loop | `false` |
| `AGENT_POLL_INTERVAL_SECONDS` | Poll loop cadence | `10` |
| `SECRET_KEY` | JWT signing key — set 32+ bytes in production | dev-only default |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token lifetime | `60` |
| `RATE_LIMIT_PER_MINUTE` | Per-client request budget | `120` |

`CMDOP_API_KEY` is still read but no longer has an effect — see §2.

## 10. Roadmap / Not Yet Built

Carried forward from the original build brief — still genuinely outstanding, not yet reflected elsewhere in this doc:

- **Persistence** — new to this list, and now the most consequential gap: state is in-memory and process-local, so it resets on restart and cannot be shared across replicas. Everything else here presumes that gets addressed first.
- **Kubernetes / Nginx / multi-region deployment** — no k8s manifests or reverse-proxy config exist. (The previous single-host Docker Compose target went away with the Python service; the app is now a single Node process.)
- **Background job queue** — no equivalent of Celery; the only scheduled work is the in-process `SupplyAgent` poll loop (`agents/runner.ts`).
- **Shipping-carrier / port-authority / customs-system integrations** — `lib/server/integrations` covers weather, routing, and pricing (§7) only; carriers/ports/customs-documents are modeled as plain CRUD entities today, not connected to any real external system (e.g. ASYCUDA).
- **OpenClaw dispatching real remote work** — see §2; no JavaScript runtime client exists, so this would need either a Python sidecar or a REST surface.
- **Crop-yield prediction** — `services/intelligence.ts` covers demand forecast, spoilage, transport delay, and shortage; yield prediction from production signals isn't implemented.
- **Automated test suite** — the Python `pytest` suite went away with the backend and has no TypeScript replacement yet; the port was verified by an end-to-end API smoke test, not committed tests.

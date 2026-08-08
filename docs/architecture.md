# Nexus-Grid — Architecture & Reference

How the application's pieces connect at runtime — frontend, FastAPI backend,
rule-based agents, LangGraph workflow, LLM integration, and the external
data providers — plus what's still outstanding. Consolidates what were
previously `model_connections.md` and `development_master_prompt.md`
(the latter was the original phase-by-phase build brief; its still-relevant
parts live on in §9 below, the rest is superseded by this doc reflecting
what's actually built).

## 1. Big Picture

Nexus-Grid is a three-tier system:

```
React frontend (frontend/src)
        │  REST + JWT (api.ts / auth.ts)
        ▼
FastAPI backend (backend/app/main.py)
   ├── Domain APIs (farmers, crops, buyers, shipments, logistics, climate, customs)
   ├── Event bus (in-process) → SupervisorAgent → specialist agents
   ├── LangGraph workflow (/workflow) → one LLM call (MiniMax, direct HTTP)
   │      + real human-in-the-loop pause/resume at the approval gate
   ├── External data providers (weather, routing, pricing) → real sources
   └── Background SupplyAgent poll loop
        ▼
Postgres (SQLAlchemy models) (docker-compose.yml)
```

There are three layers of "intelligence," connected through an event bus and
a LangGraph workflow. Only one of them calls a real LLM; a separate layer
(§7) calls real external data sources.

## 2. The LLM Connection

The only place a model is invoked is `backend/app/workflows/minimax_recommend.py`:

- `recommend_supply_response()` builds a prompt from supply-chain context (crop, quantity, farmer, island, market/weather/demand/logistics signals) and POSTs it directly to **MiniMax**'s OpenAI-compatible chat completions endpoint via `httpx`.
- The request goes to `{MINIMAX_BASE_URL}/chat/completions` with `Authorization: Bearer {MINIMAX_API_KEY}`, model `MINIMAX_MODEL` (default `MiniMax-M2`, a reasoning model — responses include a `<think>...</think>` block the frontend strips out for display).
- Keys/URLs come from the environment or `.env` (see `app/config/settings.py`).
- **Graceful degradation**: if `MINIMAX_API_KEY` is unset, or the HTTP call fails for any reason (network, auth, timeout), the function returns a `{"source": "stub"|"error", ...}` payload instead of raising, so the workflow keeps running without an LLM.

### OpenClaw / cmdop

OpenClaw is an *agent runtime* client (a themed wrapper over the `cmdop` SDK), **not** a chat model. It is loaded through the compat shim `app/integrations/openclaw_compat.py` and constructed only when `CMDOP_API_KEY` is set (no key is configured today — none was provided among this project's buildathon resources). `openclaw_runtime_status()` (`ready | unconfigured | unavailable`) is attached to both the recommendation payload and, honestly, to the `execute` node's output as `dispatch_mode` (`"openclaw"` vs `"simulated"`) — so the UI never implies a real dispatch happened when it didn't.

## 3. The LangGraph Workflow

`backend/app/workflows/supply_chain_graph.py` implements the control loop as a stateful graph:

```
perceive → assess → recommend → plan → (approval gate) → execute → monitor → recover
                                              │                                  │
                                          hold (interrupt)              assess ◄── re-plan (max 1×)
```

- **State** is a `SupplyState` TypedDict; each node returns only the keys it updates and LangGraph merges them.
- **`recommend` is the only LLM node** — it calls `recommend_action` (which wraps `recommend_supply_response`) with up to 3 retries for transient failures. Every other node is deterministic Python driven by `app/services/supply_rules.py`.
- **Real human-in-the-loop approval gate**: when `require_approval` is set and the plan's priority is `high`/`urgent`, `hold_for_approval` calls LangGraph's `interrupt()` — this genuinely pauses graph execution (not just a status label) and checkpoints state. `POST /workflow/trigger`'s response reports `"status": "awaiting_approval"` with the interrupt payload. A human decides via `POST /workflow/{thread_id}/resume` (`{"decision": "approved"|"rejected"}`), which calls `orchestrator.resume_run()` → `graph.stream(Command(resume=decision), config)` on the same thread, continuing exactly where it paused. Detection of the paused state uses `graph.get_state(config).next`/`.interrupts` (non-empty `.next` = still paused).
- **Re-planning**: `monitor` detects disruption (severe weather or constrained logistics) and loops back to `assess` at most `MAX_REPLANS = 1` time.
- **Checkpointing**: required for `interrupt()`/resume to work at all, and selected by `CHECKPOINTER_BACKEND` — `memory` (default), `sqlite`, or `postgres`. Runs are inspectable and resumable by thread id.
- Exposed via the `/workflow` API router: `GET /status`, `POST /trigger`, `POST /{thread_id}/resume`.

## 4. The Rule-Based Agent Layer

`backend/app/agents/` contains deterministic agents (no LLM calls):

- **`BaseAgent`** (`base.py`) defines the contract: `handle(db, payload) → AgentResult` (action + confidence 0..1 + rationale + outputs), a bounded in-memory `deque` of the last 50 results, per-agent logging, and persistence of every decision as an `AgentActivity` row for auditing.
- **`SupplyAgent`** (`supply_agent.py`) confidence is *computed*, not hardcoded: it's a function of how many crops were scanned, how many were anomalous, and — for crops classified as "normal" — how close their quantity sits to the surplus/shortage thresholds (`app/services/supply_rules.py`). More corroborating signal and clearer margins from the threshold both raise confidence.
- **`SupervisorAgent`** (`supervisor.py`) is the single dispatch point. A routing table maps events to specialists:
  | Event | Specialist |
  | --- | --- |
  | `buyer.request.created`, `crop.harvest.ready` | DemandIntelligenceAgent |
  | `weather.alert` | ClimateRiskAgent |
  | `shipment.delayed`, `customs.approved` | LogisticsAgent |
  | `shipment.departed` | CustomsAgent |
- **`SupplyAgent` poll loop** (`runner.py`): started at app startup (unless `SKIP_AGENT_STARTUP`), it opens a DB session every `AGENT_POLL_INTERVAL_SECONDS` (default 10s) and runs supply checks that can emit events.

## 5. The Event Bus (Glue)

`backend/app/events/` provides the bus that connects domain activity to the agents:

- `EventBus` (`bus.py`) is a synchronous in-process publish/subscribe dispatcher — the only backend.
- `main.py`'s lifespan registers handlers (`handlers.py`) and starts the bus; handlers dispatch events into `supervisor.dispatch(db, event, payload)`.

## 6. Data & Security Layers

- **Models** (`app/models/`): SQLAlchemy entities — farmers, crops, buyers, demands, shipments, carriers, warehouses, ports, trade routes, weather events, customs documents, users, plus `AgentActivity` and `AuditLog`. Tables are created at startup; Alembic owns real migrations.
- **Auth**: every route except `/`, `/health`, `/metrics`, and `/auth` requires a JWT (`get_current_user`); observability routes (`/agent-activities`, `/audit-logs`) and `/workflow/*` additionally require the `government` role (`admin` bypasses every role check).
- **Middleware**: request metrics and rate limiting (in-process, memory-backed sliding window).

## 7. External Data Providers

`backend/app/integrations/interfaces.py` defines three `Protocol`s (`WeatherProvider`, `RoutingProvider`, `PricingProvider`) so adapters can swap without touching callers (`app/services/intelligence_service.py`). Each has a `stub` (deterministic hash, labeled `"source": "stub"`, still registered for tests) and a **real** default:

| Interface | Real adapter | Source | Notes |
| --- | --- | --- | --- |
| Weather | `OpenMeteoWeatherProvider` (`weather_live.py`) | [Open-Meteo](https://open-meteo.com) (forecast) + [NOAA NHC](https://www.nhc.noaa.gov/CurrentStorms.json) (active storms) | Both free, keyless, live. Risk derived from real windspeed/precipitation thresholds. |
| Routing | `GeoRoutingProvider` (`routing_geo.py`) | Haversine distance over real island coordinates (`geo.py`) | No free live inter-island freight API exists; this is a real geography-based estimate, labeled `"source": "geo-estimate"`, not a live carrier feed. |
| Pricing | `ReferencePricingProvider` (`pricing_reference.py`) | Static Caribbean wholesale reference table + real crop-seasonality trend | FAOSTAT's live API was unreachable (HTTP 521) when checked and is a poor fit for a synchronous request path regardless; base price is a labeled snapshot (`price_as_of`), trend is derived from real Caribbean harvest-season calendars against the current month, not random. |

Every real adapter catches network/timeout/lookup failures internally and falls back to the stub — callers always get a usable response, honestly labeled by `source`. See `docs/buildathon_resources.md` for more real-data sources if further providers get built out (trade volumes, production stats, etc.).

## 8. End-to-End Flows

**Event-driven (rules only):**

1. A domain API writes data (e.g. a shipment is marked delayed) and publishes `shipment.delayed`.
2. The event bus delivers it to a handler, which calls the SupervisorAgent.
3. The supervisor routes to the LogisticsAgent, whose decision is logged, remembered, and persisted as an `AgentActivity` row.

**Workflow-driven (includes the LLM, autonomous except at the approval gate):**

1. A client POSTs to `/workflow/trigger` with a supply signal.
2. LangGraph runs perceive → assess, classifying supply risk from quantity.
3. `recommend` calls MiniMax (or returns a stub without a key).
4. `plan` builds a concrete action.
5. Non-urgent plans proceed straight to `execute`; urgent plans genuinely pause at `hold` (§3) until `POST /workflow/{thread_id}/resume` supplies a decision — the only point a run isn't autonomous.
6. `execute` → `monitor` (may re-plan once on disruption) → `recover`, with the full state history checkpointed per thread id.

## 9. Configuration Summary

All settings live in `app/config/settings.py` (env vars / `.env`):

| Variable | Purpose | Default |
| --- | --- | --- |
| `MINIMAX_API_KEY` | Enables the LLM recommendation step | empty (stub mode) |
| `MINIMAX_BASE_URL` | MiniMax's OpenAI-compatible endpoint | `https://api.minimax.io/v1` |
| `MINIMAX_MODEL` | MiniMax model id to call | `MiniMax-M2` |
| `CMDOP_API_KEY` | Enables the OpenClaw runtime client | empty (unconfigured) |
| `DATABASE_URL` | Postgres connection | compose default |
| `CHECKPOINTER_BACKEND` | `memory` \| `sqlite` \| `postgres` | `memory` |
| `SKIP_AGENT_STARTUP` | Disable the SupplyAgent poll loop | `false` |
| `AGENT_POLL_INTERVAL_SECONDS` | Poll loop cadence | `10` |

## 10. Roadmap / Not Yet Built

Carried forward from the original build brief — still genuinely outstanding, not yet reflected elsewhere in this doc:

- **Kubernetes / Nginx / multi-region deployment** — current deployment target is single-host Docker Compose only (see `docker-compose.yml`); no k8s manifests or reverse-proxy config exist yet.
- **Background job queue** — no Celery or equivalent; the only scheduled work is the in-process `SupplyAgent` poll loop (`runner.py`).
- **Shipping-carrier / port-authority / customs-system integrations** — `app/integrations` covers weather, routing, and pricing (§7) only; carriers/ports/customs-documents are modeled as plain CRUD entities today, not connected to any real external system (e.g. ASYCUDA).
- **OpenClaw dispatching real remote work** — see §2; currently status-only, no `CMDOP_API_KEY` configured.
- **Crop-yield prediction** — `app/services/intelligence_service.py` covers demand forecast, spoilage, transport delay, and shortage; yield prediction from production signals isn't implemented.

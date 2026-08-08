# How Nexus-Grid Works: Model & Agent Connections

This document explains how the application's pieces connect at runtime — the frontend, the FastAPI backend, the rule-based agents, the LangGraph workflow, and the single LLM integration point.

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
   └── Background SupplyAgent poll loop
        ▼
Postgres (SQLAlchemy models) (docker-compose.yml)
```

There are three layers of "intelligence," connected through an event bus and a LangGraph workflow. Only one of them calls a real LLM.

## 2. The LLM Connection

The only place a model is invoked is `backend/app/workflows/minimax_recommend.py`:

- `recommend_supply_response()` builds a prompt from supply-chain context (crop, quantity, farmer, island, market/weather/demand/logistics signals) and POSTs it directly to **MiniMax**'s OpenAI-compatible chat completions endpoint via `httpx` — no LangChain or OpenAI SDK involved.
- The request goes to `{MINIMAX_BASE_URL}/chat/completions` with `Authorization: Bearer {MINIMAX_API_KEY}`, model `MINIMAX_MODEL` (default `MiniMax-M2`), temperature 0.4.
- Keys/URLs come from the environment or `.env` (see `app/config/settings.py`).
- **Graceful degradation**: if `MINIMAX_API_KEY` is unset, or the HTTP call fails for any reason (network, auth, timeout), the function returns a `{"source": "stub"|"error", ...}` payload instead of raising, so the workflow keeps running without an LLM.

### OpenClaw / cmdop

OpenClaw is an *agent runtime* client (a themed wrapper over the `cmdop` SDK), **not** a chat model. It is loaded through the compat shim `app/integrations/openclaw_compat.py` and constructed only when `CMDOP_API_KEY` is set. Today its role is limited to availability reporting (`openclaw_runtime_status()` → `ready | unconfigured | unavailable`) attached to the recommendation payload; execution agents don't yet dispatch real remote work through it.

## 3. The LangGraph Workflow

`backend/app/workflows/supply_chain_graph.py` implements the control loop as a stateful graph:

```
perceive → assess → recommend → plan → (approval gate) → execute → monitor → recover
                                                                      │
                                                       assess ◄── re-plan (max 1×)
```

- **State** is a `SupplyState` TypedDict; each node returns only the keys it updates and LangGraph merges them.
- **`recommend` is the only LLM node** — it calls `recommend_action` (which wraps `recommend_supply_response`) with up to 3 retries for transient failures. Every other node (`perceive`, `assess`, `plan`, `execute`, `monitor`, `recover`) is deterministic Python driven by `app/services/supply_rules.py`.
- **Approval gate**: when `require_approval` is set and the plan's priority is `high`/`urgent`, the run holds at `awaiting_approval` instead of executing.
- **Re-planning**: `monitor` detects disruption (severe weather or constrained logistics) and loops back to `assess` at most `MAX_REPLANS = 1` time.
- **Checkpointing**: the compiled graph uses a checkpointer selected by `CHECKPOINTER_BACKEND` — `memory` (default), `sqlite` (durable local file at `checkpointer_sqlite_path`), or `postgres` (shared across replicas via the app's `DATABASE_URL`). Runs are inspectable and resumable by thread id.
- The workflow is exposed to clients via the `/workflow` API router.

## 4. The Rule-Based Agent Layer

`backend/app/agents/` contains deterministic agents (no LLM calls):

- **`BaseAgent`** (`base.py`) defines the contract: `handle(db, payload) → AgentResult` (action + confidence 0..1 + rationale + outputs), a bounded in-memory `deque` of the last 50 results, per-agent logging, and persistence of every decision as an `AgentActivity` row for auditing.
- **`SupervisorAgent`** (`supervisor.py`) is the single dispatch point. A routing table maps events to specialists:

  | Event | Specialist |
  |---|---|
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
- **Auth**: every route except `/`, `/health`, `/metrics`, and `/auth` requires a JWT (`get_current_user`); observability routes (`/agent-activities`, `/audit-logs`) additionally require the `government` role.
- **Middleware**: request metrics and rate limiting (in-process, memory-backed sliding window).

## 7. End-to-End Flows

**Event-driven (rules only):**
1. A domain API writes data (e.g. a shipment is marked delayed) and publishes `shipment.delayed`.
2. The event bus delivers it to a handler, which calls the SupervisorAgent.
3. The supervisor routes to the LogisticsAgent, whose decision is logged, remembered, and persisted as an `AgentActivity` row.

**Workflow-driven (includes the LLM):**
1. A client POSTs to `/workflow` with a supply signal.
2. LangGraph runs perceive → assess, classifying supply risk from quantity.
3. `recommend` calls MiniMax (or returns a stub without a key).
4. `plan` builds a concrete action; urgent plans may hold for human approval.
5. `execute` → `monitor` (may re-plan once on disruption) → `recover`, with the full state history checkpointed per thread id.

## 8. Configuration Summary

All settings live in `app/config/settings.py` (env vars / `.env`):

| Variable | Purpose | Default |
|---|---|---|
| `MINIMAX_API_KEY` | Enables the LLM recommendation step | empty (stub mode) |
| `MINIMAX_BASE_URL` | MiniMax's OpenAI-compatible endpoint | `https://api.minimax.io/v1` |
| `MINIMAX_MODEL` | MiniMax model id to call | `MiniMax-M2` |
| `CMDOP_API_KEY` | Enables the OpenClaw runtime client | empty (unconfigured) |
| `DATABASE_URL` | Postgres connection | compose default |
| `CHECKPOINTER_BACKEND` | `memory` \| `sqlite` \| `postgres` | `memory` |
| `SKIP_AGENT_STARTUP` | Disable the SupplyAgent poll loop | `false` |
| `AGENT_POLL_INTERVAL_SECONDS` | Poll loop cadence | `10` |

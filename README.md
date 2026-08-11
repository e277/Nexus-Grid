# Nexus-Grid

Autonomous agentic orchestration platform for Caribbean food systems, built as a
single Next.js application — the operator console and the agent/workflow runtime
live in the same codebase and run as one service.

## Quick start

```bash
npm install
npm run dev     # http://localhost:5173
```

No database, broker, or API key is required. The store seeds a demo dataset on
first request; register an account on the login screen to get in (the role you
pick decides which tabs you see).

```bash
npm run build && npm start   # production
npm run typecheck            # tsc --noEmit
```

Optional configuration lives in `.env.local` — see `.env.example`. Setting
`MINIMAX_API_KEY` (or `SHO_API_KEY`) activates the workflow's LLM recommendation
step; without it that step returns a labelled stub.

## Structure

```
src/
  app/
    api/            # Route handlers — the HTTP surface (auth, domain, workflow, observability)
    layout.tsx      # Root layout
    page.tsx        # Client shell
  components/       # UI: panels, tables, charts, workflow pipeline, forms
  views/            # Overview, Farm, Market, Logistics, Government, Workflow
  api.ts            # Typed client for /api/*
  auth.ts           # Bearer token storage
  types.ts          # Shared response types
  lib/server/       # Everything that used to be the Python service
    agents/         # supervisor + supply, demand, logistics, climate-risk, customs
    workflows/      # graph runtime, supply-chain graph, orchestrator, LLM step
    services/       # domain rules, events, explainable intelligence
    integrations/   # weather (Open-Meteo), routing (geo), pricing (reference), stubs
    repositories.ts # Data access over the in-memory store
    store.ts        # Tables, id sequences, demo seed
    security.ts     # PBKDF2 hashing, HS256 JWTs, RBAC
    http.ts         # Route wrapper: rate limit, metrics, error mapping
```

`src/lib/server/**` is server-only: it is imported exclusively by route
handlers, which all declare the Node.js runtime because the store, the agent
loop, and the workflow checkpointer are process-local singletons.

## How it works

**Agents** (`src/lib/server/agents`) — a supervisor routes each domain event to
a specialist. Every agent returns a structured result with inputs, outputs,
bounded memory, a rationale, and a 0..1 confidence score, and each run is
persisted as an agent activity so operators can audit what happened and why.
The supply agent additionally runs on a timer, scanning inventory and opening a
workflow run for each surplus/shortage it finds.

**Events** (`src/lib/server/events.ts`) — creating a demand, filing a weather
alert, moving a shipment, or approving a customs document publishes a domain
event (`buyer.request.created`, `weather.alert`, `shipment.departed`,
`customs.approved`, …). Handlers run before the request returns, so an agent's
reaction is visible in the same round trip that caused it.

**Workflow** (`src/lib/server/workflows`) — the control loop
`perceive → assess → recommend → plan → (approval gate) → execute → monitor → recover`,
with a re-plan edge from `monitor` back to `assess` when a disruption appears
(capped at one). `graph.ts` is a small state-graph runtime replacing LangGraph:
shared state merged from partial node updates, conditional edges, a checkpointer
keyed by thread id, and `interrupt()` for the human approval gate. A held run
returns `status: "awaiting_approval"` and resumes on the same thread via
`POST /api/workflow/{threadId}/resume`.

**Intelligence** (`src/lib/server/services/intelligence.ts`) — demand forecast,
spoilage risk, transport delay, and regional shortage. Each returns the number,
the inputs that produced it, and a plain-language explanation.

## API

Every route requires `Authorization: Bearer <token>` except `/api`,
`/api/health/*`, `/api/metrics`, and `/api/auth/*`. Writes additionally require a
matching role — farmers create crops, buyers create demands, logistics manages
shipments/ports/carriers, government approves customs and triggers workflows;
admin passes everything.

- `POST /api/auth/register`, `POST /api/auth/token`, `GET /api/auth/me`
- `GET|POST /api/farmers`, `/api/crops`, `/api/buyers`, `/api/demands`, `/api/shipments` (+ `GET .../{id}`)
- `PATCH /api/demands/{id}/status`, `PATCH /api/shipments/{id}/status`
- `GET|POST /api/carriers`, `/api/warehouses`, `/api/ports` (+ `PATCH /api/ports/{id}/status`), `/api/trade-routes`
- `GET|POST /api/weather-events`, `/api/customs-documents` (+ `PATCH /api/customs-documents/{id}/status`)
- `GET /api/intelligence/overview`, `/demand-forecast/{crop}`, `/spoilage/{cropId}`, `/transport-delay`, `/shortage/{crop}`
- `GET /api/workflow/status`, `POST /api/workflow/trigger`, `POST /api/workflow/{threadId}/resume`
- `GET /api/agent-activities`, `GET /api/audit-logs` (government/admin)
- `GET /api/health`, `GET /api/health/db`, `GET /api/metrics`

## Data

State is in-memory and process-local: the store seeds three farmers with
harvested lots, three buyers with open demand, two shipments, two active
hazards, and three ports on startup, and resets when the server restarts. That
matches how the service behaved before — it seeded the same dataset whenever the
database was empty — and keeps the app dependency-free. Swapping
`src/lib/server/store.ts` for a real database is the one change needed to
persist.

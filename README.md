# Nexus-Grid

Autonomous agentic orchestration platform for Caribbean food systems, built as a
single Next.js application — the operator console and the agent/workflow runtime
live in the same codebase and run as one service.

## Quick start

```bash
npm install
npm run dev     # http://localhost:5180
```

No database, broker, or API key is required, and there is no sign-in — identity
belongs to the system integrating this one. The first request warms the source
caches in the background; UN Comtrade takes around a minute to answer, and the
console shows each publisher as `pending` until it does rather than showing a
zero.

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
    api/            # Route handlers — the HTTP surface (domain, workflow, observability)
    layout.tsx      # Root layout, applies the stored theme before first paint
    page.tsx        # Client shell
  App.tsx           # Shell: rail, breadcrumb, page switch
  navigation.ts     # The seven pages and their groups — one source for nav and breadcrumb
  components/
    shell/          # Sidebar, TopBar, MobileNav, NavSheet
    pipeline/       # Node model, phase/canvas geometry, SVG diagram, approval panel
    charts/         # chart-kit and the charts over agent output
    ui/             # shadcn-style primitives (Radix + CVA)
  views/            # Dashboard (loop + the four domain readings) and ImpactView (the charts)
  api.ts            # Typed client for /api/*
  types.ts          # Shared response types
  index.css         # Design tokens — dark on bare :root, light under [data-theme]
  lib/server/       # Everything that used to be the Python service
    sources/        # Six publishers, each with provenance and its own cache
    projection.ts   # The derived regional read model
    lanes.ts        # Supplier→importer lanes derived from the projection
    matching.ts     # Ranks those lanes — which supplier to approach first, and why
    interpretation/ # Per-domain agent analysis — what every page renders
    agents/         # supervisor + supply, demand, logistics, agronomy, climate, planting
    workflows/      # graph runtime, supply-chain graph, orchestrator, LLM step
    observability/  # Agent activity and the audit trail — the only records owned here
    http.ts         # Route wrapper: rate limit, metrics, audit, error mapping
```

`src/lib/server/**` is server-only: it is imported exclusively by route
handlers, which all declare the Node.js runtime because the store, the agent
loop, and the workflow checkpointer are process-local singletons.

## How it works

**The console is agent output.** Each page asks an agent one question about one
domain and renders the answer — a summary, then findings carrying a severity, a
confidence, what should change, who would act, and the figures the claim rests
on. It does not render the read model as tables and charts: a member state can
already produce its own trade table, and what it cannot produce is what the
region's figures mean together. The numbers appear as the evidence each finding
cites. Without an API key the same shape is filled deterministically and
labelled `Rule-derived`.

**Sources** (`src/lib/server/sources`) — six publishers, fetched concurrently
and independently, each with its own cache and a provenance record. One
unavailable publisher degrades its own slice of the picture and nothing else,
which is the property that lets this run against systems it does not control.
A source that did not answer is reported as `pending`, `cached` or
`unavailable`; it is never quietly treated as zero.

**Projection** (`src/lib/server/projection.ts`) — the derived regional read
model: per-state profiles, substitution opportunities, and complementary
planting windows. Nothing in it is entered by hand, and it is thrown away on
the next fetch. `lanes.ts` derives supplier→importer routes from the same
model, pairing each sourcing gap with the member states already supplying that
commodity and routing them on real port coordinates.

**Agents** (`src/lib/server/agents`) — a supervisor routes each domain event to
a specialist. Every agent returns a structured result with inputs, outputs,
bounded memory, a rationale, and a 0..1 confidence score, and each run is
persisted as an agent activity so operators can audit what happened and why.
The supply agent additionally runs on a timer.

**Workflow** (`src/lib/server/workflows`) — the control loop
`perceive → assess → recommend → plan → (approval gate) → execute → monitor → recover`,
with a re-plan edge from `monitor` back to `assess` when a disruption appears
(capped at one). It runs on **LangGraph**, with `interrupt()` for the human
approval gate. A held run returns `status: "awaiting_approval"` and resumes on
the same thread with one of four decisions — `approved`, `modified`,
`rejected`, `escalated` — the last three carrying an operator note that is
recorded against the gate.

**Paused runs survive a restart.** The checkpointer writes to a SQLite file
(`CHECKPOINT_DB_PATH`), because a human takes human time over an approval and
an in-memory gate dies on the next deploy. Set the path empty for in-memory.

**Runs stream.** `POST /api/workflow/stream` emits each node as it completes
over server-sent events, so the console shows a run's real pace rather than
replaying a finished one on a timer.

**Plans get delivered.** The `execute` node hands an approved plan to a running
[OpenClaw](https://openclaw.ai) gateway over its HTTP tool surface — the
gateway owns the channels a ministry desk reads. Unconfigured, the dispatch is
labelled simulated rather than pretending to have sent; rejected and escalated
plans are never delivered at all.

## API

No authentication: identity belongs to the system integrating this one. An
optional `X-Actor` header carries that system's own attribution into the audit
trail. Every route is rate-limited and records Prometheus metrics.

- `GET /api/sources`, `POST /api/sources/refresh` — provenance, and a forced sweep
- `GET /api/picture` — the derived regional read model (`?refresh=true` to refetch)
- `GET /api/signals` — the interpreted coordination signals
- `GET /api/analysis/{domain}` — one agent's reading of `market`, `soil`, `planting`, `logistics` or `impact` (`?refresh=true` to re-read)
- `GET /api/analysis` — all five readings plus the decision record and supplier rankings, which the analysis page charts
- `GET /api/lanes` — supplier→importer lanes, a ranked supplier shortlist per gap, port exposure, and what is *not* observed
- `GET /api/workflow/status`, `POST /api/workflow/trigger`, `POST /api/workflow/{threadId}/resume`
- `POST /api/workflow/stream` — run or resume, streaming each node as it completes (SSE)
- `GET /api/agent-activities`, `GET /api/audit-logs`
- `GET /api/health`, `GET /api/health/db`, `GET /api/metrics`

## Data

The platform holds no domain records: farmers, crops, shipments and customs
filings live in the systems it coordinates. The only two tables it owns are
agent activities and the audit trail, and both are in-memory and process-local
— they reset when the server restarts. Swapping
`src/lib/server/observability/store.ts` for a real database is the one change
needed to persist them.

The one exception is the workflow checkpointer, which writes paused runs to a
SQLite file so an approval gate outlives the process that created it.

Everything else on screen is derived from the current source snapshots and
recomputed on the next fetch.

## Architecture

Full reference — the thesis, sources, projection, interpretation, agents, the
coordination graph, and what is and is not implemented against the buildathon
brief — is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

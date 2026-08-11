# Nexus-Grid — Architecture & Reference

Autonomous coordination layer for Caribbean food systems.
Built for the Future Caribbean Global AI Buildathon, Food Systems & Supply
Chains track.

This is the single reference for the project: what it is, how it is built, what
it reads, what is implemented against the brief, and what is not.

---

## 1. The thesis

The Caribbean imports roughly 80% of its food — over $10B a year across 30+
island states — while holding the capacity to produce far more of it. The
constraint is not the absence of systems. Agriculture, logistics, trade and
distribution systems all exist and all work. They do not work *together*.

Production decisions are made without visibility into regional demand.
Agricultural cycles are not aligned across islands. Soil conditions are not
shared. Logistics operate without coordination across routes and supply.

**Nexus-Grid is the layer that makes those systems observable together, then
reasons over the result.** It is not a marketplace and does not list supply. It
holds no domain records: farmers, crops, shipments and customs filings live in
the systems it coordinates. It reads published data, lines it up, and produces
coordination signals no single member state could see alone.

The measure is whether outcomes improve — more predictable yields, better land
use, more efficient logistics, stronger regional food security — not whether
supply is listed.

---

## 2. What it finds

From live public data, at the time of writing:

- **$1.52B** of food imports observed across 12 CARICOM states (UN Comtrade)
- **9.1%** of it sourced from inside CARICOM — the rest comes from outside the
  region
- Guyana imports **$190M** of cereals, **100%** externally, while Jamaica,
  Trinidad & Tobago and St Vincent already ship cereals into the region
- Trinidad & Tobago imports **$139M** of vegetables, **97.8%** externally,
  while Dominica, Belize and St Vincent supply vegetables regionally
- Guyana and Jamaica have **6 non-overlapping rain-fed planting months** for
  cereals — they can stagger rather than compete

None of those figures are entered by hand. Each traces to a published source.

---

## 3. Architecture

```
Operator console (src/app, src/views, src/components)
        │  REST (src/api.ts)
        ▼
Route handlers (src/app/api/**/route.ts)
        │
        ▼
Interpretation (lib/server/interpretation)   ← the only LLM call on this path
        ▲
        │
Projection (lib/server/projection.ts)        ← the derived read model
        ▲
        │
Sources (lib/server/sources)                 ← six publishers, with provenance
        │
        └─ Agents (lib/server/agents) and the coordination graph
           (lib/server/workflows) read the same projection
```

Directories map onto that shape rather than onto an inherited layering:
`sources/` fetches, `projection.ts` derives, `interpretation/` interprets,
`agents/` and `workflows/` act, `observability/` holds the only records this
platform owns. Cross-cutting concerns — config, http, metrics, rate limiting,
validation — sit at the top level.

Every route handler declares `runtime = "nodejs"`: the source caches, agent
memory and the workflow checkpointer are process-local singletons on
`globalThis`, and the Edge runtime would give each request its own copy.

### Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind with shadcn-style
primitives (Radix + CVA) · Recharts · Vitest. One process, no database, no
broker, no Docker.

---

## 4. Sources

All six are **public and keyless**. No source requires a credential.

| Source | Publisher | Provides | Operational note |
| --- | --- | --- | --- |
| `world-bank` | World Bank Open Data | Food-import dependency, arable and agricultural land, agriculture share of GDP, population, cereal yield | Returns an *empty body*, not an error, when asked for too many countries — batched five at a time |
| `comtrade` | UN Comtrade (public preview) | Partner-level food trade flows, all 15 member states | Rate-limits hard; 1.2s spacing plus one backed-off retry. At 350ms it silently dropped two thirds |
| `climate` | Open-Meteo + NOAA NHC | Per-island 7-day outlook, topsoil moisture, weekly rainfall, active storms | Fetched in batches of four; a 15-way fan-out gets throttled |
| `soil` | ISRIC SoilGrids | pH, organic carbon, clay, sand under each growing area | ~5 calls/minute; see §5 |
| `agroclimate` | NASA POWER | Monthly climate normals per growing area | Feeds the planting calendar |

`SourceStatus` is deliberately richer than a boolean: `live`, `cached`
(publisher down, serving the last good snapshot), `pending` (first fetch not
finished), `empty` (reachable, nothing usable), `unauthorized`, `unavailable`.
Provenance — publisher, endpoint, status, fetch time — travels with the data to
the UI. A coordination layer that hides which inputs are missing is worse than
one with fewer inputs.

**FAOSTAT was wired and then removed**: its open API now answers 401 without a
key, and this platform runs on free sources only.

### Not wired

Named in the brief, not implemented: WFP food-security survey, CARDI,
ministries of agriculture, CDB/IDB, satellite imagery. CIMH is not used
directly — Open-Meteo and NOAA cover the climate signal.

---

## 5. Sampling soil honestly

Two properties of SoilGrids shaped the design.

**Capitals are the wrong place to ask about soil.** They sit on the coast, and
the grid returns no data over urban and near-shore pixels. The registry carries
a `farmland` point per state alongside the port coordinate: Guyana's coastal
rice belt, Haiti's Artibonite valley, Belize's Cayo, Trinidad's central plain.

**The API allows ~5 calls a minute** and answers 503 past that, so a
fifteen-state sweep cannot happen in one pass. Each state is cached
independently for a month — soil does not move — and each refresh tops up
three, with failures cached briefly so one bad point cannot block every state
behind it. The source reports how many states it still owes.

---

## 6. The projection

`lib/server/projection.ts` computes the regional read model, rebuilt from
whatever the sources last returned.

- **State profiles** — import dependency, intra-CARICOM share, production
  capacity, soil, and the months each state can plant rain-fed.
- **Substitution opportunities** — where a state buys a commodity outside the
  region that another member already supplies into it. The
  "what is grown vs. where it is needed" question, in the only data spanning
  both sides.
- **Planting alignment** — supplier/importer pairs whose rain-fed windows do
  *not* overlap. Two islands that can only plant the same three months compete;
  two whose windows differ cover more of the calendar. Visible only because
  every calendar comes from one model rather than fifteen ministry records.

---

## 7. Interpretation

The only LLM call on the read path. It receives the derived picture — never raw
payloads — and must return structured findings citing the figures they rest on.
A signal an operator cannot trace back to an observed number is not actionable.

Kinds: `import_substitution`, `production_alignment`, `climate_exposure`,
`logistics`, `data_gap`. The model is explicitly instructed to raise a
`data_gap` rather than reason around a missing source.

Cached for 15 minutes and never run against a picture whose sources have not
arrived — an early call produces a confident reading of nothing. Without a key
it degrades to deterministic rule-derived signals labelled `source: "rules"`.

---

## 8. Agents

A supervisor routes each coordination event to a specialist. Every agent
returns a structured result (action, 0..1 confidence, rationale, outputs),
keeps bounded memory, and persists each run as an agent activity.

| Event | Specialist |
| --- | --- |
| `substitution.gap.detected`, `demand.review.requested` | Demand intelligence |
| `climate.risk.elevated`, `storm.alert` | Climate risk |
| `lane.assessment.requested` | Logistics |
| `planting.window.review` | Planting coordination |
| `soil.assessment.requested` | Agronomy |

All read the same projection. The **supply agent** is the publisher: its
periodic scan sweeps the picture, opens a coordination run for each gap past
the threshold, and raises the events above.

Confidence is computed, never hardcoded — the supply agent's is the share of
scanned lanes clearing the threshold; the demand agent's tracks how lopsided
the sourcing is.

---

## 9. The coordination graph

```
perceive → assess → recommend → plan → (approval gate) → execute → monitor → recover
                                            │                          │
                                        hold (interrupt)      assess ◄── re-plan (max 1×)
```

`workflows/graph.ts` is a small state-graph runtime: shared state merged from
partial node updates, conditional edges, a checkpointer keyed by thread id, and
`interrupt()` for the human gate.

**Execution is not a straight line.** The gate branches, and `monitor` can send
a run back to `assess`. A real trace with elevated climate risk:

```
1 perceive → 2 assess → 3 recommend → 4 plan → 5 execute → 6 monitor
           → 7 assess → 8 recommend → 9 plan → 10 execute → 11 monitor → 12 recover
```

Five nodes execute twice. The console renders this as a graph rather than a
pipeline: nodes carry the step numbers they ran at, traversed edges are drawn
solid, and the backward re-plan edge is distinguished from forward flow.

When a plan is urgent and `require_approval` is set, the run genuinely halts —
state is checkpointed *before* the node, the response reports
`awaiting_approval` with the interrupt payload, and `updates` stops after
`plan`. Resuming re-enters `hold` with the decision and continues.

---

## 10. Against the build brief

| Brief area | Status |
| --- | --- |
| Farm-to-Market Intelligence | **Implemented** — substitution engine over real trade flows |
| Crop Planning & Yield Forecasting | **Implemented** — NASA POWER calendars, World Bank yield |
| Soil Monitoring & Agricultural Intelligence | **Implemented** — SoilGrids properties, live topsoil moisture |
| Regional Planting Coordination | **Implemented** — complementary rain-fed window pairing |
| Supply Chain Visibility | **Partial** — provenance on every input; no shipment-level tracking |
| Port & Logistics Coordination | **Partial** — lane estimates and climate exposure; no port or customs system |
| Freight Matching & Route Optimization | **Weak** — geographic transit estimates only; no free capacity feed exists |
| Food Distribution & Inventory Optimization | **Not built** |

---

## 11. What the platform owns

Two tables: agent activities and the audit trail. The audit trail is written by
the route wrapper and attributed via an optional `X-Actor` header, so an
integrating system carries its own identity in. There is no user model and no
authentication — identity belongs to the host system.

---

## 12. Configuration

Every value has a working default; the app runs with no configuration at all.
See `.env.example`. The only meaningful key is the LLM provider (MiniMax, or
any OpenAI-compatible endpoint via the `SHO_*` variables); without it,
interpretation falls back to labelled rule-derived signals.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 19 tests
npm run typecheck
npm run build
```

---

## 13. Not yet built

- **Persistence** — the most consequential gap. State is in-memory and
  process-local; it resets on restart. `next start` was verified to run a
  single process, so the singletons are shared, but that is a deployment
  assumption worth re-checking.
- **Additional publishers** — the five brief-named sources in §4.
- **Freight capacity** — no free inter-island capacity API exists; the platform
  says so rather than inventing a vessel.
- **Port and customs systems** — no ASYCUDA or port authority connection.
- **Test depth** — 19 tests cover the graph runtime, projection and caching.
  Sources are verified against live endpoints, not mocked in CI.

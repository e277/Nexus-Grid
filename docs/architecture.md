# Nexus-Grid — Architecture & Reference

How the pieces connect at runtime — upstream sources, the derived regional
picture, the interpretation step, the agents, and the coordination loop — plus
what is still outstanding.

## 1. The shape of the thing

Nexus-Grid is a coordination layer. It holds no domain records: farmers, crops,
shipments and customs filings live in the systems it coordinates. What it does
is read published sources, line them up against each other, and interpret the
result into coordination signals no single member state could see alone.

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

Directories map onto that shape rather than onto a layering the code no longer
has: `sources/` fetches (routing lives here too — it is another external
estimate), `projection.ts` derives, `interpretation/` interprets, `agents/` and
`workflows/` act, and `observability/` holds the only records this platform
owns. Cross-cutting concerns — config, http, metrics, rate limiting, validation
— sit at the top level.

Everything below the console is server-only, imported exclusively by route
handlers. Every handler declares `runtime = "nodejs"`: the source caches, agent
memory, and the workflow checkpointer are process-local singletons on
`globalThis`, and the Edge runtime would give each request its own copy.

## 2. Sources

`lib/server/sources` fetches from publishers this project does not control.
Every snapshot carries a `Provenance` — publisher, endpoint, status, fetch time
— and that travels with the data all the way to the UI, because a coordination
layer that hides which of its inputs are missing is worse than one with fewer
inputs.

| Source | Publisher | What it provides | Notes |
| --- | --- | --- | --- |
| `world-bank` | World Bank Open Data | Food-import dependency, arable and agricultural land, agriculture share of GDP, population, cereal yield | Returns an *empty body*, not an error, when asked for too many countries at once — requests batch five states at a time |
| `comtrade` | UN Comtrade (public preview) | Partner-level food trade flows for all 15 member states | Rate-limits hard; 1.2s spacing plus one backed-off retry. At 350ms it silently dropped two thirds of the states |
| `climate` | Open-Meteo + NOAA NHC | Per-island 7-day outlook, topsoil moisture, weekly rainfall, active storms | Islands fetched in batches of four; a 15-way fan-out gets throttled |
| `soil` | ISRIC SoilGrids | pH, organic carbon, clay, sand under each state's growing area | ~5 calls/minute; see §3 |
| `agroclimate` | NASA POWER | Monthly climate normals per growing area | Feeds the planting calendar |

`SourceStatus` is deliberately more than a boolean: `live`, `cached` (publisher
down, serving the last good snapshot), `empty` (reachable, nothing usable),
`unauthorized`, `unavailable`. The cache serves stale data on failure and says
that it did.

## 3. Sampling soil honestly

Two things about SoilGrids shaped the design.

Capitals are the wrong place to ask about soil — they sit on the coast, and the
grid returns no data over urban and near-shore pixels. The registry therefore
carries a `farmland` point per state alongside the port coordinate: Guyana's
coastal rice belt, Haiti's Artibonite valley, Belize's Cayo, Trinidad's central
plain.

The API also allows roughly five calls a minute and answers 503 past that, so a
fifteen-state sweep is impossible in one pass. Each state is cached
independently for a month — soil does not move — and each refresh tops up three,
with failures cached briefly so one bad point cannot block every state behind
it. The picture fills in over the first few refreshes and the source reports how
many states it still owes.

## 4. The projection

`lib/server/projection.ts` computes the regional read model. It is thrown away
and rebuilt from whatever the sources last returned; nothing is entered by hand.

- **State profiles** — import dependency, intra-CARICOM share, production
  capacity, soil, and the months each state can plant rain-fed.
- **Substitution opportunities** — where a state buys a commodity outside the
  region that another member already supplies into it. This is the
  "what is grown vs. where it is needed" question expressed in the only data
  that spans both sides.
- **Planting alignment** — supplier/importer pairs whose rain-fed windows do
  *not* overlap. Two islands that can only plant the same three months compete;
  two whose windows differ cover more of the calendar between them. Only
  visible because every state's calendar comes from one model instead of
  fifteen separate ministry records.

## 5. Interpretation

`lib/server/interpretation/signals.ts` is the only LLM call on the read path. It
receives the derived picture — never raw payloads — and must return structured
findings that cite the figures they rest on. A signal an operator cannot trace
back to an observed number is not actionable.

Kinds: `import_substitution`, `production_alignment`, `climate_exposure`,
`logistics`, `data_gap`. The model is explicitly instructed to raise a
`data_gap` rather than reason around a missing source.

Without a key it degrades to deterministic rule-derived signals, labelled
`source: "rules"` so they are never mistaken for interpretation.

## 6. Agents

`lib/server/agents` — a supervisor routes each coordination event to a
specialist. Every agent returns a structured result (action, 0..1 confidence,
rationale, outputs), keeps bounded memory, and persists each run as an agent
activity.

| Event | Specialist |
| --- | --- |
| `substitution.gap.detected`, `demand.review.requested` | Demand intelligence |
| `climate.risk.elevated`, `storm.alert` | Climate risk |
| `lane.assessment.requested` | Logistics |
| `planting.window.review` | Planting coordination |
| `soil.assessment.requested` | Agronomy |

All of them read the same projection. The **supply agent** is the publisher:
its periodic scan sweeps the picture, opens a coordination run for each gap past
the threshold, and raises the events above so the specialists actually run.

Confidence is computed, never hardcoded — the supply agent's is the share of
scanned lanes that cleared the threshold; the demand agent's tracks how lopsided
the sourcing is.

## 7. The coordination graph

`lib/server/workflows/supply-chain-graph.ts`:

```
perceive → assess → recommend → plan → (approval gate) → execute → monitor → recover
                                            │                          │
                                        hold (interrupt)      assess ◄── re-plan (max 1×)
```

`graph.ts` is a small state-graph runtime: shared state merged from partial node
updates, conditional edges, a checkpointer keyed by thread id, and `interrupt()`
for the human gate. When a plan is urgent and `require_approval` is set, the run
genuinely halts — state is checkpointed before the node, the response reports
`awaiting_approval` with the interrupt payload, and `updates` stops after
`plan`. Resuming the thread re-enters `hold` with the decision and continues to
`recover`.

State is a sourcing gap, not a crop lot. `recommend` is the only LLM node.

## 8. What the platform does own

Two tables: agent activities and the audit trail. The audit trail is written
automatically by the route wrapper and attributed via an optional `X-Actor`
header, so an integrating system carries its own identity in — this layer has no
user model and no authentication.

## 9. Configuration

Everything has a working default; the app runs with no configuration at all
because every source is public and keyless. See `.env.example`. The only
meaningful key is the LLM provider; without it, interpretation falls back to
labelled rule-derived signals.

## 10. Not yet built

- **Persistence** — the most consequential gap. State is in-memory and
  process-local, so it resets on restart. Related: `next start` may run multiple
  workers, each with its own `globalThis`, which would make the caches, agent
  memory, and checkpointer per-worker. Unconfirmed and worth checking before
  this runs anywhere real.
- **Automated tests** — verified by end-to-end API checks against live sources,
  but nothing committed that CI runs.
- **Freight capacity** — the logistics agent estimates a lane from real distance
  and live climate at both ends, and says plainly that no free inter-island
  capacity feed exists rather than inventing a vessel.
- **Port and customs systems** — no connection to ASYCUDA or port authorities.
- **Additional publishers** — WFP food-security survey, CARDI, ministries of
  agriculture, CDB/IDB, and satellite imagery are all named in the brief and
  none are wired. FAOSTAT was wired and then removed: its open API now requires
  a key, and this platform runs on free sources only.

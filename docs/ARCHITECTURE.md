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
primitives (Radix + CVA) · Recharts · LangGraph · Vitest. One process, no
broker, no Docker; the only persistence is a single SQLite file holding paused
workflow runs.

### The console

Two pages behind a collapsible rail (60px icons / 240px labelled). A
breadcrumb above each names its group, and below `lg` the rail becomes a
slide-over with a two-tab bottom bar.

```
OPERATIONS   Dashboard         the coordination loop, and the intelligence it acts on
ANALYSIS     Impact Metrics    everything the agents concluded, as charts you can cut
```

It was seven. Farm-to-Market, Soil & Crop Intel, Planting Coordination and
Port & Logistics were each one agent's reading of one domain, and splitting
them across four destinations put the reasoning a navigation step away from the
run it justifies — an operator deciding at the approval gate wants the market
and weather readings on the same screen as the decision. They are now a
switcher under the loop, one domain at a time: rendering all four at once
buries the pipeline under several screens of text.

**Every page is agent output, not a rendering of the projection.** The first
version rendered the read model directly — stat tiles of trade totals, a
stacked bar of import values, a matrix of external shares, a sortable table of
every gap. All correct, and all something a member state can already produce
from its own systems. What no member state can produce is what the region's
figures mean *together*, which is the only thing this platform exists to say.
So each domain asks an agent one question and renders the answer: a summary,
then findings carrying a severity, a confidence, what should change, who would
act, and the figures the claim rests on. The numbers moved into the evidence
each finding cites, attached to the conclusion they support.

`lib/server/interpretation/analysis.ts` holds the five domains, their prompts
and their deterministic fallbacks, over shared rules: cite figures present in
the input, never invent a number, raise a `gap` finding rather than reason
around a missing source, and write names out in full. Readings are cached 15
minutes per domain and revalidated behind the request — a model round-trip is
far too slow for a polling loop and is billed per call — so the first read
returns rule-derived findings immediately and the next poll swaps in the
agent's.

### The analysis page

`GET /api/analysis` returns all five readings at once plus the platform's own
decision record, so the charts do not depend on request ordering. Everything
plotted there is **agent output**: findings by domain and severity, the
confidence attached to them, how the supplier ranking scored each candidate,
what the agents decided and what humans answered at the gate.

One filter row scopes the page and the charts cross-filter — a domain picked in
the pills, or a bar clicked in the chart, narrows every other chart and the
findings list together. Every chart ships a table view, so no value is
reachable only by hovering.

Chart colour is computed, not chosen. The five categorical slots are assigned
in fixed order and never cycled, and both modes were validated against their
own card surface for the lightness band, chroma floor, adjacent-pair CVD
separation (worst ΔE 8.4 dark / 9.1 light under protanopia), the normal-vision
floor (19.3 / 19.6) and contrast. Severity and gate outcomes wear **status**
tokens rather than categorical slots — "critical" means critical, and must
never be mistaken for "series 1". Legends are rendered outside Recharts:
it reorders a stacked legend and its types reject an explicit payload, which
left the key in a different order from the stack it described.

**There is no "Data Sources" page**, deliberately. Provenance is a property of
a figure, so each reading carries its own source panel naming just the
publishers behind it, what each contributed, its status and age; and when one
is degraded, which of the agent's conclusions are standing on missing ground.
`src/source-map.ts` holds that mapping, keyed off `slot` rather than
`Provenance.source` — Open-Meteo and the NOAA hurricane feed share the
`climate` SourceId, so it cannot tell six publishers apart.

**Dark is the product's mode**, not a preference: tokens are on bare `:root`
(slate-900 base, emerald accent) and light is reached only by the toggle,
never by `prefers-color-scheme`.

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

## 7. Interpretation and the model step

The only LLM call on the read path. It receives the derived picture — never raw
payloads — and must return structured findings citing the figures they rest on.
A signal an operator cannot trace back to an observed number is not actionable.

Kinds: `import_substitution`, `production_alignment`, `climate_exposure`,
`logistics`, `data_gap`. The model is explicitly instructed to raise a
`data_gap` rather than reason around a missing source.

Cached for 15 minutes and never run against a picture whose sources have not
arrived — an early call produces a confident reading of nothing. Without a key
it degrades to deterministic rule-derived signals labelled `source: "rules"`.

### The recommendation step asks for a schema

The workflow's `recommend` node used to request free text and then perform
surgery on it: strip `<think>` blocks with a regex, split reasoning from answer
on a pattern, truncate the remainder to fit a card. That is guesswork about a
string, and it broke visibly — a model handed a prompt template whose slots
were only sometimes filled reasonably talked about *the template*, and the
approval card filled with its deliberation.

It now sends `response_format: json_schema` for `{ action, rationale,
confidence, risks }`, and the prompt states the observed figures as facts
rather than as placeholders. The console renders named fields, the approval
panel shows the model's own confidence instead of one inferred from which
provider answered, and the risks it names sit unfolded above the decision
buttons — a named risk is the reason a human is standing there.

Not every OpenAI-compatible endpoint honours the parameter, and MiniMax was
observed honouring it on some calls and not others. A response that is not
valid JSON is therefore still accepted, carried as prose and labelled
`structured: false`, which the card surfaces as an "unstructured" badge.
Degraded and visible, rather than silently mis-parsed.

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

The graph runs on **LangGraph** (`@langchain/langgraph`). It ran on a
hand-rolled runtime of about 220 lines — nodes, conditional edges, state merge,
a checkpointer, `interrupt()` — which did the job for as long as the
checkpointer only had to live as long as the process. It did not survive the
requirement that it outlive one. Rather than grow a second implementation of
durable execution, the graph moved to the library whose checkpointer
abstraction is exactly that. Node bodies are unchanged pure functions; the
wiring and the state declaration moved.

Two constraints came with it, both visible in the code:

- **A node may not share a name with a state channel.** The nodes are the
  domain vocabulary — `plan`, `monitor` — and they appear in the diagram, the
  docs and the brief, so the channels were renamed instead: `plan_data` and
  `monitor_result`.
- **`Annotation.Root` declares the state**, and every channel here is
  last-write-wins, which is the same contract the nodes were already written
  against.

### Persistence

`workflows/checkpointer.ts` selects the store. With `CHECKPOINT_DB_PATH` set
(the default) it is SQLite — one file, no server, no container, so the app
keeps its "no database required" property. Empty falls back to memory, and a
missing native build degrades to memory with a warning rather than failing to
boot.

This is the difference between a gate a human can take an hour over and one
that dies with the process. Verified end to end: a run paused at the gate, the
server killed, restarted as a fresh process, and the same thread resumed with
its decision and finished.

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

**Four answers at the gate**, not two: `approved`, `modified`, `rejected`,
`escalated`. An operator who would approve the plan *with an amendment*, or who
is not the right person to decide it, has nowhere to put that in an
approve/reject pair, and collapsing either into "approved" loses the one piece
of information the gate exists to capture. `modified` and `escalated` carry a
free-text note, which `holdForApproval` records against the gate and `recover`
reads — a modified plan proceeds with the amendment attached, an escalated one
routes to `await_higher_authority` rather than closing either way.

Each decision is audited under its own action name (`workflow.gate_modified`,
…) with the note as the detail, so the Impact Metrics page can break gate
outcomes down without re-reading run state. The route wrapper's `audit` option
exists for exactly this: four outcomes at one gate are four different events,
and `POST …/resume` cannot tell them apart from the path alone.

### Streaming

`POST /api/workflow/stream` runs or resumes a thread and emits each node as it
completes, over server-sent events.

The console used to animate a run it already had in full: the trigger endpoint
returned every update at once and the client replayed them on 550ms timers.
That looked live and was not — the pace was a constant, so a thirty-second
model call and an instant rule branch drew identically, and nothing on screen
was true until the whole run had finished. It now streams
LangGraph's `updates` mode, which emits exactly `{ [node]: partialUpdate }` —
the shape the console already read, so live progress and the collected result
describe a run the same way.

The diagram marks a node `running` only where the graph can be in exactly one
place: at the entry node, and after any node whose single outgoing edge is
unambiguous. `plan` and `monitor` both branch, so nothing is claimed there
until the next event says which way the run went. Guessing would be the
animation this replaced.

### Delivering a plan

The `execute` node posts an approved plan into the **dashboard** of an
**OpenClaw** gateway — a separate long-running process whose Control UI is the
surface an operator actually watches. This app calls that gateway; it does not
embed it.

That is deliberate. The `openclaw` npm package *is* the gateway: 56 direct
dependencies, ~365 packages installed, a CLI, an onboarding wizard and a plugin
SDK with some three hundred export paths, meant to be run with `openclaw
onboard` and left running. Embedding it in a Next.js route handler would
multiply this app's ten runtime dependencies thirtyfold to obtain one thing —
"put this plan in front of an operator" — that the gateway already exposes on
its control plane. It also declares a Node engine range this project does not
satisfy.

The call is `chat.inject`: it appends the plan to the dashboard session and
broadcasts it to the Control UI, with **no agent run, no model call and no
outbound channel delivery**. That is the right shape for what a plan is — a
notice for a human to read, not a prompt for an agent to answer — and it is why
delivery needs no phone number or channel target at all.

Two properties of the gateway shape the wiring, and neither is obvious:

- `chat.inject` is an `operator.admin` method on the gateway's **WebSocket**
  control plane. The HTTP surface (`POST /tools/invoke`) reaches the agent
  *tool* registry only, which has no tool that writes to the dashboard, so this
  one call cannot go over HTTP.
- A shared-token connection is granted its operator scopes **only from
  loopback**. Addressed across a container network the app authenticates
  successfully and is then permitted nothing — the handshake succeeds with an
  empty scope set and the call is refused. So `docker-compose.yml` runs the app
  inside the gateway's network namespace, the same arrangement the `cli`
  service already needs, and the console's port is published on the gateway
  service because a container sharing a namespace cannot publish its own.

The client is about eighty lines against `WebSocket` (global in Node 22) — open
a socket, answer the `connect.challenge`, make one call, close — and adds no
dependency.

Only an approved or amended plan is posted; a rejected or escalated one is a
decision *not* to act, and posting it anyway would be the opposite of what the
gate is for. Delivery is keyed by thread id, so re-running a thread does not
re-notify the desk; unlike the tool surface, `chat.inject` takes no idempotency
key, so that memory is kept in-process here and is lost on restart. A delivery
failure is recorded as a follow-up in `recover` rather than failing the run.
With no gateway configured the status is `unconfigured` and the console says
"not delivered" — never "done".

---

## 9a. Ranking suppliers

Lanes answer *what routes exist*. Sixty lanes is a list, not a decision, so
`matching.ts` ranks them: for one gap, which supplier to approach first.

Four factors, each observed or derived, weighted to 100:

| Factor | Weight | Source |
| --- | --- | --- |
| Transit | 35 | Great-circle distance between main ports at a documented average sea speed |
| Weather at both ends | 25 | Live Open-Meteo risk; the weaker end sets the score, since both must be clear for a lane to run |
| Complementary planting | 20 | NASA POWER rain-fed windows the supplier has and the importer does not |
| Established regional trade | 20 | Whether the supplier already ships that commodity into the region at observed volume |

Three rules keep it honest:

- **An unknown weather reading scores 0.5, not 1.** Scoring it as clear would
  reward a state precisely because nothing is known about it, and the rationale
  says "no current weather reading" rather than "clear" — that distinction was
  a real bug, caught when the sentence claimed clear weather over factors that
  said unknown.
- **A supplier the routing layer cannot place is dropped, not scored.** Missing
  coordinates fall back to a hashed stub distance, and ranking on a hashed
  number is ranking on noise.
- **Price, vessel capacity and port throughput are not scored, and the response
  says so.** No free source publishes any of them for this region. A ranking
  that silently weighted an invented number would be worse than no ranking.

The shortlist is what the logistics analyst reads. It is passed *instead of*
the raw lane list, not alongside it: an earlier version gave both — one sorted
by score, one by value — and the analyst read them as a single ranking and
reported that the nearer supplier had been placed lower than the farther one,
which it had not.

---

## 10. Against the build brief

| Brief area | Status |
| --- | --- |
| Farm-to-Market Intelligence | **Implemented** — substitution engine over real trade flows |
| Crop Planning & Yield Forecasting | **Implemented** — NASA POWER calendars, World Bank yield |
| Soil Monitoring & Agricultural Intelligence | **Implemented** — SoilGrids properties, live topsoil moisture |
| Regional Planting Coordination | **Implemented** — complementary rain-fed window pairing |
| Supply Chain Visibility | **Partial** — provenance on every input; no shipment-level tracking |
| Port & Logistics Coordination | **Partial** — `/api/lanes` derives every supplier→importer lane and returns a ranked shortlist per gap; no port or customs system |
| Freight Matching & Route Optimization | **Implemented** — `matching.ts` ranks every regional supplier per gap on transit, live weather at both ends, complementary planting and established trade, and states the factors it refuses to score |
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
npm run dev        # http://localhost:5180
npm test           # 19 tests
npm run typecheck
npm run build
```

---

## 13. Not yet built

- **Persistence, partly closed.** Paused workflow runs now survive a restart
  through the SQLite checkpointer. The source caches, agent memory and the two
  observability tables are still in-memory and process-local, and still reset.
  `next start` was verified to run a single process, so the singletons are
  shared, but that is a deployment assumption worth re-checking.
- **Additional publishers** — the five brief-named sources in §4.
- **Freight capacity** — no free inter-island capacity API exists; the platform
  says so rather than inventing a vessel. Supplier ranking scores what *is*
  observed and lists price, capacity and port throughput as explicitly
  unscored, so a reader can see the shape of what is missing.
- **Port and customs systems** — no ASYCUDA or port authority connection.
- **Test depth** — 40 tests cover the coordination graph, projection, caching,
  supplier matching and the naming layers. Sources are verified against live
  endpoints, not mocked in CI.

/**
 * Per-page analysis: the agent's reading of one domain, not a data dump.
 *
 * Each intelligence page is an agent's answer to one question, and the numbers
 * appear only as the evidence it cites. That inverts the usual arrangement:
 * do — render the projection as tables and charts and leave the reader to draw
 * the conclusion — and it is the point of the platform: a member state can
 * already see its own trade table, and what it cannot see is what the region's
 * figures mean together.
 *
 * The constraint that makes this safe is unchanged: every finding must cite
 * figures present in the input, and the model is told to raise a gap rather
 * than reason around missing data. A finding an operator cannot check is not
 * actionable, and this layer coordinates systems it does not control.
 *
 * Without an API key each domain degrades to deterministic rule-derived
 * findings, labelled `rules` so they are never mistaken for a reading.
 */

import { byIso3, byName } from "../sources/caricom";
import type { RegionalPicture, SubstitutionOpportunity } from "../projection";
import type { CoordinationOutcome } from "../observability/coordination";
import type { Lane, PortExposure } from "../lanes";
import type { GapMatch } from "../matching";
import { callModelJson, resolveProvider } from "./provider";

export type AnalysisDomain = "market" | "soil" | "planting" | "logistics" | "impact" | "distribution";

export const ANALYSIS_DOMAINS: AnalysisDomain[] = [
  "market",
  "soil",
  "planting",
  "logistics",
  "impact",
  "distribution",
];

export type FindingSeverity = "critical" | "opportunity" | "watch" | "gap";

export interface Finding {
  /** Short headline — what the agent concluded. */
  title: string;
  /** What it observed, in one or two sentences. */
  finding: string;
  /** What should change and who would act. */
  recommendation: string;
  /** The figures this rests on, so an operator can check it. */
  evidence: string[];
  severity: FindingSeverity;
  confidence: "low" | "medium" | "high";
  /** Full names of the member states involved — never codes. */
  states: string[];
  /**
   * The figures that make this finding visual, authored by the agent.
   *
   * The console charts these rather than parsing them back out of the prose.
   * Asking the model for numbers as numbers is the difference between a page
   * that can draw a bar and one that regex-scrapes its own paragraphs.
   */
  metrics: FindingMetric[];
}

export type MetricUnit = "usd" | "percent" | "count" | "months" | "hours" | "km";

export interface FindingMetric {
  label: string;
  value: number;
  unit: MetricUnit;
  /** The whole this value is part of, when it is a part. */
  of: number | null;
}

export interface AnalysisResult {
  domain: AnalysisDomain;
  /** Model that produced this, or `rules` for the deterministic fallback. */
  source: string;
  /** One paragraph the page leads with. */
  summary: string;
  findings: Finding[];
  note?: string;
  generated_at: string;
}

/** Extra inputs a domain needs beyond the regional picture. */
export interface AnalysisInputs {
  picture: RegionalPicture;
  lanes?: Lane[];
  ports?: PortExposure[];
  /** Ranked suppliers per gap, so the analyst can name a first choice. */
  matches?: GapMatch[];
  /** Agent decisions, for the outcomes domain. */
  decisions?: { agent: string; action: string; confidence: number | null }[];
  gateOutcomes?: Record<string, number>;
  /**
   * What the coordination loop has already concluded about specific gaps.
   *
   * A reading that describes a gap the operator resolved an hour ago, as
   * though nothing had been decided, is stale in the way that matters most.
   */
  coordination?: CoordinationOutcome[];
}

// ── Prompts ───────────────────────────────────────────────────────────────

const BASE_RULES = `Rules:
- Ground every finding in figures present in the input. Never invent a number.
- Every evidence entry must carry a figure with its unit and the publisher it came from.
- Say what should change and who would act, not just what is true.
- If the input is too thin to support a claim, return a "gap" finding saying exactly what is missing instead of guessing.
- Prefer findings that span two or more member states.

- Write names out in full everywhere — "Trinidad and Tobago", not "TTO"; "United States", not a country code. Never abbreviate a member state, a partner or a commodity.
- Keep "finding" to one or two sentences and "recommendation" to one. The console draws the numbers; the prose only has to say what they mean.
- Attach 1 to 3 "metrics" to every finding: the figures a chart should show. Each is {"label","value","unit","of"}. "value" is a bare number, never a formatted string. "unit" is one of: usd, percent, count, months, hours, km. "of" is the whole when the value is part of one (e.g. value 190369647, of 190369647 total imports of that commodity), otherwise null. Use only numbers present in the input.

Return ONLY a JSON object of this exact shape, no markdown fence and no prose:
{"summary":"two or three sentences an operator reads first","findings":[{"title":"short headline","finding":"one or two sentences","recommendation":"one sentence: what changes and who acts","evidence":["figure with unit and source"],"metrics":[{"label":"short label","value":123,"unit":"usd","of":456}],"severity":"critical|opportunity|watch|gap","confidence":"low|medium|high","states":["full member state name"]}]}

Return between 3 and 5 findings, most consequential first.`;

const DOMAIN_BRIEF: Record<AnalysisDomain, string> = {
  market: `You analyse where the Caribbean's food money leaves the region.
Focus on: which member states buy outside CARICOM what another member already supplies into it, how large each of those gaps is, and which are worth acting on first.`,

  soil: `You analyse the region's growing conditions and production capability.
Focus on: what the soil and climate at each state's main growing area actually permit, which states are physically able to supply what the region imports, and where conditions constrain that.`,

  planting: `You analyse how the region's planting calendars line up.
Focus on: where rain-fed windows overlap so states compete in the same weeks, where they differ so states could stagger and widen regional coverage, and which months the region has almost no one planting.`,

  logistics: `You analyse the routes a coordination plan would actually move over.
Focus on: which supplier-to-importer lanes are viable, what the transit and weather exposure at each end imply, and which lanes are worth opening first. A ranked shortlist is supplied for each gap — use it, say which supplier you would approach first and why, and disagree with the ranking only if the figures give you a reason. Transit figures are geometry estimates, not carrier quotes; price, vessel capacity and port throughput are not observed at all, so never rank on them.`,

  impact: `You analyse what the coordination layer is achieving.
Focus on: the size of the addressable gap against the region's import bill, what the agents have actually decided so far and how confident they were, and whether the decisions taken are moving the region toward regional sourcing.`,

  distribution: `You analyse distribution and inventory timing with no stock, warehouse, or spoilage data — none exists in any source you are given. Focus on: which sourcing gaps have no regional supplier able to start a rain-fed season on that commodity this month at all, so the gap is calendar-locked to external sourcing until a specific future month; how food-import exposure concentrates per resident across member states; and the region's directly observed cereal production scale. Never state a stock level, a delivery date, or a spoilage window — none of those are derivable from what you are given, and rain_fed_months marks when a season can start, not when a harvest is ready.`,
};

function systemPrompt(domain: AnalysisDomain): string {
  return `You are the ${domain} analyst of a Caribbean food-system coordination platform.

You receive a regional picture assembled from public data: World Bank indicators, UN Comtrade trade flows, ISRIC soil readings, NASA POWER planting calendars, and live Open-Meteo and NOAA climate data across CARICOM member states. You do not collect this data and cannot query anything else.

${DOMAIN_BRIEF[domain]}

${BASE_RULES}`;
}

function usd(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

// ── Distribution helpers ─────────────────────────────────────────────────
//
// No stock, warehouse or spoilage data exists in any source, so "distribution
// timing" can only mean: which gaps have no regional planting-window option
// open right now. `rain_fed_months` marks when a season can start, not a
// harvest date, so this never becomes "arrives in N weeks" — only "not before
// month X".

const MONTH_ORDER = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The nearest of `months` from the current calendar month, following month order. */
function nearestUpcomingMonth(months: string[]): { month: string; monthsAway: number } | null {
  const currentIndex = new Date().getMonth();
  let best: { month: string; monthsAway: number } | null = null;
  for (const m of months) {
    const idx = MONTH_ORDER.indexOf(m);
    if (idx === -1) continue;
    const monthsAway = (idx - currentIndex + 12) % 12;
    if (best === null || monthsAway < best.monthsAway) best = { month: m, monthsAway };
  }
  return best;
}

interface CalendarLock {
  opportunity: SubstitutionOpportunity;
  nextOpenMonth: string;
  monthsAway: number;
}

/**
 * Gaps where none of the regional suppliers can start a rain-fed season on
 * the commodity this month.
 *
 * Uses the opportunity's raw `regional_suppliers`, not `matching.ts`'s
 * geo-filtered shortlist — whether a lane can be routed is irrelevant to
 * whether a state can agronomically start supplying something right now.
 * A gap with no planting-calendar data for any candidate is left out rather
 * than called "locked": that is missing data, not a timing claim.
 */
function calendarLockedGaps(picture: RegionalPicture): CalendarLock[] {
  const monthsByName = new Map(picture.states.map((s) => [s.name, s.rain_fed_months]));
  return picture.substitution_opportunities
    .map((opportunity): CalendarLock | null => {
      const openMonths = new Set<string>();
      for (const supplier of opportunity.regional_suppliers) {
        for (const m of monthsByName.get(supplier) ?? []) openMonths.add(m);
      }
      if (openMonths.size === 0) return null;
      const nearest = nearestUpcomingMonth([...openMonths]);
      if (nearest === null || nearest.monthsAway === 0) return null;
      return { opportunity, nextOpenMonth: nearest.month, monthsAway: nearest.monthsAway };
    })
    .filter((x): x is CalendarLock => x !== null)
    .sort((a, b) => b.opportunity.external_usd - a.opportunity.external_usd);
}

/** States ranked by food-import dollars per resident — an exposure proxy, not a risk score. */
function perCapitaExposure(picture: RegionalPicture) {
  return picture.states
    .filter((s): s is typeof s & { population: number } => (s.population ?? 0) > 0 && s.food_imports_usd > 0)
    .map((s) => ({ state: s, usdPerCapita: s.food_imports_usd / s.population }))
    .sort((a, b) => b.usdPerCapita - a.usdPerCapita);
}

function buildUserPrompt(domain: AnalysisDomain, inputs: AnalysisInputs): string {
  const { picture } = inputs;
  const totals = `REGIONAL TOTALS (trade year ${picture.totals.trade_year ?? "unknown"})
Observed food imports across ${picture.totals.states_covered} member states: ${usd(picture.totals.food_imports_usd)}
Sourced from inside CARICOM: ${usd(picture.totals.intra_caricom_usd)} (${picture.totals.intra_caricom_share_pct ?? "?"}%)`;

  const gaps = `DATA GAPS\n${picture.gaps.join("\n") || "None — every publisher answered."}`;

  /**
   * What the loop has already concluded, so a reading can build on it rather
   * than describe a gap as untouched after an operator has acted on it.
   *
   * Written as decisions taken, not as instructions: the analyst is told what
   * happened and left to judge what it means.
   */
  const coordination = (inputs.coordination ?? []).length
    ? "COORDINATION ALREADY TAKEN\n" +
      (inputs.coordination ?? [])
        .map((c) => {
          const gate = c.gate_decision
            ? `a human ${c.gate_decision} it`
            : "no human decision was required";
          const sent =
            c.dispatch_status === "delivered"
              ? "and it was delivered to the desk"
              : c.dispatch_status === "failed"
                ? "and delivery failed"
                : "and nothing was delivered";
          return (
            `${c.importer} / ${c.commodity} (${usd(c.external_usd)} external): the loop chose ` +
            `${c.decision.replace(/_/g, " ")}, planned to ${c.action.replace(/_/g, " ")} ` +
            `at ${c.priority} priority; ${gate} ${sent}.` +
            (c.gate_note ? ` Operator note: ${c.gate_note}` : "")
          );
        })
        .join("\n")
    : "COORDINATION ALREADY TAKEN\nNo coordination run has concluded yet.";

  if (domain === "market") {
    const opportunities = picture.substitution_opportunities
      .map(
        (o) =>
          `${o.importer} imports ${usd(o.external_usd)} of ${o.commodity} from outside CARICOM ` +
          `(${o.external_share_pct}% of its imports of that commodity; top external partners: ${o.top_external_partners.join(", ")}). ` +
          `Members already shipping ${o.commodity} into the region: ${o.regional_suppliers.join(", ")}.`
      )
      .join("\n");
    return `${totals}

IMPORT SUBSTITUTION CANDIDATES
${opportunities || "No substitution candidates in the trade data."}

${coordination}

${gaps}`;
  }

  if (domain === "soil") {
    const states = picture.states
      .filter((s) => s.soil?.has_coverage || s.arable_land_pct !== null)
      .map((s) =>
        [
          s.name,
          s.soil?.ph !== null && s.soil?.ph !== undefined ? `soil pH ${s.soil.ph}` : "soil pH unknown",
          s.soil?.organic_carbon_g_per_kg
            ? `organic carbon ${s.soil.organic_carbon_g_per_kg} g/kg`
            : "organic carbon unknown",
          s.soil?.clay_pct ? `clay ${s.soil.clay_pct}%` : "clay unknown",
          `arable land ${s.arable_land_pct ?? "?"}%`,
          `agricultural land ${s.agricultural_land_pct ?? "?"}%`,
          `cereal yield ${s.cereal_yield_kg_ha ?? "?"} kg/ha`,
          `agriculture ${s.agriculture_value_added_pct ?? "?"}% of GDP`,
          `rain-fed months ${s.rain_fed_months.length}`,
          `climate risk ${s.climate_risk ?? "unknown"}`,
          s.soil?.suitability ? `soil note: ${s.soil.suitability}` : "",
        ]
          .filter(Boolean)
          .join("; ")
      )
      .join("\n");
    const climate = picture.climate.islands_at_risk
      .map((c) => `${c.island}: ${c.risk} — ${c.summary}`)
      .join("\n");
    return `${totals}

GROWING CONDITIONS BY MEMBER STATE
${states || "No state has soil or indicator coverage yet."}

CLIMATE EXPOSURE (next 3 days)
${climate || "No islands at elevated risk."}

WHAT THE REGION IMPORTS (so capability can be judged against demand)
${picture.substitution_opportunities.map((o) => `${o.commodity}: ${o.importer} buys ${usd(o.external_usd)} externally`).join("\n") || "No trade data."}

${gaps}`;
  }

  if (domain === "planting") {
    const calendars = picture.states
      .filter((s) => s.rain_fed_months.length > 0)
      .map((s) => `${s.name}: rain-fed in ${s.rain_fed_months.join(", ")}`)
      .join("\n");
    const alignment = picture.planting_alignment
      .map(
        (a) =>
          `${a.supplier} can plant ${a.commodity} rain-fed in ${a.complementary_months.join(", ")} when ${a.importer} cannot; ` +
          `${a.importer} buys ${usd(a.external_usd)} of it externally.`
      )
      .join("\n");
    return `${totals}

RAIN-FED PLANTING WINDOWS
${calendars || "No planting calendars available."}

COMPLEMENTARY PAIRS ALREADY IDENTIFIED
${alignment || "No complementary pairs found."}

${coordination}

${gaps}`;
  }

  if (domain === "logistics") {
    // One ordering only. An earlier version passed the ranked shortlist and
    // then the raw lane list — sorted by value — directly beneath it, and the
    // analyst read the two as a single ranking and reported that the nearer
    // supplier were placed lower than the farther one, which it is not.
    // The shortlist already carries transit, weather, value and a rationale
    // per lane, so nothing is lost by giving that alone.
    const shortlists = (inputs.matches ?? [])
      .slice(0, 8)
      .map((match) => {
        const ranked = match.matches
          .map((s) => `#${s.rank} ${s.supplier} (score ${s.score}/100) — ${s.rationale}`)
          .join("\n    ");
        return (
          `${match.importer} needs ${match.commodity} ` +
          `(${usd(match.external_usd)} bought externally, ${match.external_share_pct}%):\n    ${ranked}`
        );
      })
      .join("\n");
    const ports = (inputs.ports ?? [])
      .map(
        (p) =>
          `${p.name}: on ${p.lanes} lane(s), climate risk ${p.climate_risk ?? "no current reading"}, ` +
          `${usd(p.food_imports_usd)} of food imports observed`
      )
      .join("\n");
    const storms = picture.climate.active_storms
      .map((s) => `${s.name} (${s.classification}), ${s.intensity_kt ?? "unknown"} knots`)
      .join("\n");

    return `${totals}

RANKED SUPPLIER SHORTLIST — this is the ranking, already scored
${inputs.lanes?.length ?? 0} candidate lane(s) were derived from the sourcing gaps and scored on transit, live weather at both ends, complementary planting windows, and established regional trade. Suppliers are listed best-first within each gap; #1 is the strongest match.
${shortlists || "No shortlist could be built."}

PORT EXPOSURE
${ports || "No ports on any lane."}

ACTIVE STORMS
${storms || "None in the basin."}

NOT OBSERVED: berth congestion, queue length, vessel capacity and sailing schedules are not published by any CARICOM port authority or free freight API, so they carry no weight in the scoring — never rank on them. Transit figures are great-circle distance at a documented average sea speed plus fixed port handling. Where a climate risk reads "no current reading", the weather station did not answer: that is missing data, not clear weather.

${coordination}

${gaps}`;
  }

  if (domain === "distribution") {
    const locked = calendarLockedGaps(picture);
    const lockedText = locked
      .slice(0, 8)
      .map(
        (x) =>
          `${x.opportunity.importer} buys ${usd(x.opportunity.external_usd)} of ${x.opportunity.commodity} externally; ` +
          `none of its regional suppliers (${x.opportunity.regional_suppliers.join(", ")}) can start a rain-fed season on it ` +
          `until ${x.nextOpenMonth} (${x.monthsAway} month(s) away).`
      )
      .join("\n");

    const perCapita = perCapitaExposure(picture);
    const perCapitaText = perCapita
      .slice(0, 8)
      .map(
        (x) =>
          `${x.state.name}: ${usd(x.usdPerCapita)} of food imports per resident ` +
          `(population ${x.state.population.toLocaleString()}).`
      )
      .join("\n");

    const cereal = picture.states
      .filter((s) => s.cereal_production_mt !== null)
      .sort((a, b) => (b.cereal_production_mt ?? 0) - (a.cereal_production_mt ?? 0));
    const cerealText = cereal
      .slice(0, 8)
      .map(
        (s) =>
          `${s.name}: ${s.cereal_production_mt!.toLocaleString()} metric tons of cereal production ` +
          `observed in ${s.cereal_production_year}.`
      )
      .join("\n");

    return `${totals}

CALENDAR-LOCKED SOURCING GAPS — no regional supplier can start this commodity's rain-fed season this month
${lockedText || "No gap is calendar-locked to a future month — every gap either has a regional supplier whose window is open now, or no gap has planting-calendar data for any candidate."}

PER-CAPITA FOOD-IMPORT EXPOSURE
${perCapitaText || "No state has both population and import data."}

OBSERVED REGIONAL CEREAL PRODUCTION
${cerealText || "No state has an observed cereal-production figure."}

NOT OBSERVED: there is no stock position, warehouse capacity, spoilage rate or distribution schedule anywhere in this platform's sources. rain_fed_months marks when a season can start, not when a harvest is ready — there is no crop-cycle-length data to derive a delivery date from. Cereal production is a metric-ton figure with no price series behind it — never convert it to or net it against a USD value.

${gaps}`;
  }

  // impact
  const addressable = picture.substitution_opportunities.reduce((sum, o) => sum + o.external_usd, 0);
  const decisions = (inputs.decisions ?? [])
    .slice(0, 40)
    .map((d) => `${d.agent}: ${d.action} (confidence ${d.confidence ?? "unscored"})`)
    .join("\n");
  const outcomes = Object.entries(inputs.gateOutcomes ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  return `${totals}

ADDRESSABLE BY SUBSTITUTION
${usd(addressable)} across ${picture.substitution_opportunities.length} commodity-importer pairs where a member state already supplies that commodity into the region.
If every one were met, intra-CARICOM sourcing would rise from ${picture.totals.intra_caricom_share_pct ?? "?"}% to ${
    picture.totals.food_imports_usd > 0
      ? Math.round(((picture.totals.intra_caricom_usd + addressable) / picture.totals.food_imports_usd) * 1000) / 10
      : "?"
  }%. That is arithmetic on this snapshot, a ceiling and not a forecast.

PLANTING COORDINATION AVAILABLE
${picture.planting_alignment.length} staggerable supplier-importer pairs.

AGENT DECISIONS RECORDED
${decisions || "No agent decisions recorded yet."}

HUMAN DECISIONS AT THE APPROVAL GATE
${outcomes || "None recorded yet."}

${coordination}

${gaps}`;
}

// ── Coercion ──────────────────────────────────────────────────────────────

const SEVERITIES: FindingSeverity[] = ["critical", "opportunity", "watch", "gap"];
const UNITS: MetricUnit[] = ["usd", "percent", "count", "months", "hours", "km"];

/** Keep only metrics that are actually chartable — a real number and a known unit. */
function coerceMetrics(raw: unknown): FindingMetric[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => entry as Record<string, unknown>)
    .filter(
      (entry) =>
        typeof entry.label === "string" &&
        typeof entry.value === "number" &&
        Number.isFinite(entry.value) &&
        UNITS.includes(entry.unit as MetricUnit)
    )
    .slice(0, 3)
    .map((entry) => ({
      label: String(entry.label),
      value: entry.value as number,
      unit: entry.unit as MetricUnit,
      of:
        typeof entry.of === "number" && Number.isFinite(entry.of) && entry.of > 0
          ? entry.of
          : null,
    }));
}

/**
 * Resolve whatever the model named a state as to its full name.
 *
 * The prompt asks for full names, but models reach for the ISO3 code anyway —
 * and a row of `GUY JAM TTO` badges is unreadable to anyone who does not
 * already know the region. Codes are mapped back; anything unrecognised is
 * passed through so a real name is never dropped for failing to match.
 */
function fullStateName(value: string): string {
  const raw = value.trim();
  if (!raw) return raw;
  const byCode = byIso3(raw.toUpperCase());
  if (byCode) return byCode.name;
  return byName(raw)?.name ?? raw;
}

function coerce(parsed: unknown): { summary: string; findings: Finding[] } {
  const root = (parsed ?? {}) as { summary?: unknown; findings?: unknown };
  const raw = Array.isArray(root.findings) ? root.findings : [];

  const findings = raw
    .map((entry) => entry as Record<string, unknown>)
    .filter((entry) => typeof entry.title === "string" && typeof entry.finding === "string")
    .map((entry) => ({
      title: String(entry.title),
      finding: String(entry.finding),
      recommendation: String(entry.recommendation ?? ""),
      evidence: Array.isArray(entry.evidence) ? entry.evidence.map(String) : [],
      severity: SEVERITIES.includes(entry.severity as FindingSeverity)
        ? (entry.severity as FindingSeverity)
        : "watch",
      confidence: ["low", "medium", "high"].includes(entry.confidence as string)
        ? (entry.confidence as Finding["confidence"])
        : "medium",
      states: Array.isArray(entry.states)
        ? [...new Set(entry.states.map(String).map(fullStateName).filter(Boolean))]
        : [],
      metrics: coerceMetrics(entry.metrics),
    }));

  return { summary: typeof root.summary === "string" ? root.summary : "", findings };
}

// ── Deterministic fallback ────────────────────────────────────────────────

function ruleFindings(domain: AnalysisDomain, inputs: AnalysisInputs): { summary: string; findings: Finding[] } {
  const { picture } = inputs;
  const findings: Finding[] = [];

  if (domain === "market") {
    for (const o of picture.substitution_opportunities.slice(0, 3)) {
      findings.push({
        title: `${o.importer} sources ${o.commodity.toLowerCase()} outside the region`,
        finding: `${o.external_share_pct}% of ${o.importer}'s ${o.commodity.toLowerCase()} imports come from outside CARICOM, worth ${usd(o.external_usd)}.`,
        recommendation: `Check whether ${o.regional_suppliers.slice(0, 2).join(" or ")} can cover part of this volume before the next planting cycle is committed.`,
        evidence: [
          `${usd(o.external_usd)} external, ${usd(o.intra_usd)} intra-regional (UN Comtrade)`,
          `Top external partners: ${o.top_external_partners.join(", ")}`,
        ],
        severity: o.external_share_pct > 90 ? "critical" : "opportunity",
        confidence: "medium",
        states: [fullStateName(o.importer_iso3)],
        metrics: [
          { label: `Bought outside CARICOM`, value: o.external_usd, unit: "usd", of: o.external_usd + o.intra_usd },
          { label: `External share`, value: o.external_share_pct, unit: "percent", of: 100 },
        ],
      });
    }
  }

  if (domain === "soil") {
    for (const s of picture.states.filter((x) => x.soil?.has_coverage).slice(0, 3)) {
      findings.push({
        title: `${s.name} growing conditions`,
        finding: s.soil?.suitability ?? "Soil readings available.",
        recommendation: "Weigh this against the commodities the region currently imports before committing land.",
        evidence: [
          `pH ${s.soil?.ph ?? "?"}, organic carbon ${s.soil?.organic_carbon_g_per_kg ?? "?"} g/kg, clay ${s.soil?.clay_pct ?? "?"}% (ISRIC SoilGrids)`,
          `Arable land ${s.arable_land_pct ?? "?"}% (World Bank)`,
        ],
        severity: "watch",
        confidence: "medium",
        states: [fullStateName(s.iso3)],
        metrics: [
          ...(s.soil?.ph !== null && s.soil?.ph !== undefined
            ? [{ label: "Soil pH", value: s.soil.ph, unit: "count" as const, of: 14 }]
            : []),
          ...(s.arable_land_pct !== null
            ? [{ label: "Arable land", value: s.arable_land_pct, unit: "percent" as const, of: 100 }]
            : []),
        ],
      });
    }
  }

  if (domain === "planting") {
    for (const a of picture.planting_alignment.slice(0, 3)) {
      findings.push({
        title: `${a.supplier} and ${a.importer} could stagger ${a.commodity.toLowerCase()}`,
        finding: a.note,
        recommendation: `Align the two ministries' ${a.commodity.toLowerCase()} calendars so the region covers more of the year instead of doubling up.`,
        evidence: [
          `Complementary months: ${a.complementary_months.join(", ")} (NASA POWER)`,
          `${usd(a.external_usd)} bought externally on this commodity (UN Comtrade)`,
        ],
        severity: "opportunity",
        confidence: "medium",
        states: [a.supplier, a.importer],
        metrics: [
          { label: "Months the supplier can plant and the importer cannot", value: a.complementary_months.length, unit: "months", of: 12 },
          { label: "Bought outside the region on this commodity", value: a.external_usd, unit: "usd", of: null },
        ],
      });
    }
  }

  if (domain === "logistics") {
    // Prefer the ranked shortlist: "approach Suriname first, here is why" is
    // a usable answer where "here are three lanes" is not.
    for (const m of (inputs.matches ?? []).slice(0, 3)) {
      const best = m.matches[0];
      if (!best) continue;
      findings.push({
        title: `${best.supplier} is the strongest match for ${m.importer}'s ${m.commodity.toLowerCase()}`,
        finding:
          `${best.rationale} It scores ${best.score} out of 100 against ${m.matches.length} candidate supplier(s) ` +
          `on transit, weather at both ends, complementary planting and established regional trade.`,
        recommendation: `Approach ${best.supplier} first on ${usd(m.external_usd)} of ${m.commodity.toLowerCase()} currently bought outside the region.`,
        evidence: best.factors.map((f) => `${f.label}: ${f.detail} (${f.points} points)`),
        severity: "opportunity",
        confidence: "medium",
        states: [best.supplier, m.importer],
        metrics: [
          { label: `${best.supplier} match score`, value: best.score, unit: "count", of: 100 },
          { label: "Transit", value: best.transit_hours, unit: "hours", of: null },
          { label: "Could displace", value: m.external_usd, unit: "usd", of: null },
        ],
      });
    }

    for (const l of (inputs.lanes ?? []).slice(0, 2)) {
      findings.push({
        title: `${l.supplier} to ${l.importer}`,
        finding: `A ${l.mode} lane of about ${l.transit_hours}h${l.distance_km ? ` over ${Math.round(l.distance_km)} km` : ""}, currently ${l.status.replace("_", " ")}.`,
        recommendation:
          l.status === "clear"
            ? "Weather is clear at both ends — this lane can carry a coordination plan now."
            : "Confirm the weather window at both ends before committing a shipment.",
        evidence: [
          `${Math.round(l.distance_km ?? 0)} km great-circle between main ports (geometry estimate, not a carrier quote)`,
          `Climate risk ${l.supplier_climate_risk ?? "?"} at origin, ${l.importer_climate_risk ?? "?"} at destination (Open-Meteo)`,
        ],
        severity: l.status === "at_risk" ? "watch" : "opportunity",
        confidence: "medium",
        states: [l.supplier, l.importer],
        metrics: [
          { label: "Transit", value: l.transit_hours, unit: "hours", of: null },
          ...(l.distance_km !== null
            ? [{ label: "Distance", value: Math.round(l.distance_km), unit: "km" as const, of: null }]
            : []),
        ],
      });
    }
  }

  if (domain === "distribution") {
    for (const x of calendarLockedGaps(picture).slice(0, 2)) {
      const { opportunity: o, nextOpenMonth, monthsAway } = x;
      findings.push({
        title: `${o.importer} is calendar-locked on ${o.commodity.toLowerCase()} until ${nextOpenMonth}`,
        finding: `No regional supplier of ${o.commodity.toLowerCase()} for ${o.importer} has a rain-fed window open this month; the nearest is ${nextOpenMonth}, ${monthsAway} month(s) away.`,
        recommendation: `Treat this ${usd(o.external_usd)} gap as external-only for now rather than a near-term substitution candidate.`,
        evidence: [
          `Regional suppliers checked: ${o.regional_suppliers.join(", ")} (NASA POWER rain-fed calendars)`,
          `${usd(o.external_usd)} bought outside CARICOM on this commodity (UN Comtrade)`,
        ],
        severity: monthsAway >= 6 ? "critical" : "watch",
        confidence: "medium",
        states: [o.importer],
        metrics: [
          { label: "Months until any regional window opens", value: monthsAway, unit: "months", of: 12 },
          { label: "Bought outside the region", value: o.external_usd, unit: "usd", of: null },
        ],
      });
    }

    const topExposure = perCapitaExposure(picture)[0];
    if (topExposure) {
      findings.push({
        title: `${topExposure.state.name} carries the region's highest per-resident import exposure`,
        finding: `${topExposure.state.name} imports ${usd(topExposure.usdPerCapita)} of food per resident, the highest ratio of any covered member state.`,
        recommendation: `Weigh ${topExposure.state.name} first if resilience effort is being rationed across the region rather than spread evenly.`,
        evidence: [
          `${usd(topExposure.state.food_imports_usd)} total food imports over a population of ${topExposure.state.population.toLocaleString()} (World Bank, UN Comtrade)`,
        ],
        severity: "watch",
        confidence: "medium",
        states: [topExposure.state.name],
        metrics: [
          { label: "Food imports per resident", value: Math.round(topExposure.usdPerCapita), unit: "usd", of: null },
        ],
      });
    }

    const topCereal = picture.states
      .filter((s) => s.cereal_production_mt !== null)
      .sort((a, b) => (b.cereal_production_mt ?? 0) - (a.cereal_production_mt ?? 0))[0];
    if (topCereal) {
      findings.push({
        title: `${topCereal.name} carries the region's largest observed cereal base`,
        finding: `${topCereal.name} produced ${topCereal.cereal_production_mt!.toLocaleString()} metric tons of cereal in ${topCereal.cereal_production_year}, the largest observed figure of any covered state.`,
        recommendation: `Treat this as the scale of what a regional cereal distribution plan would need to move, not a stock level available today.`,
        evidence: [`${topCereal.cereal_production_mt!.toLocaleString()} metric tons in ${topCereal.cereal_production_year} (World Bank)`],
        severity: "opportunity",
        confidence: "medium",
        states: [topCereal.name],
        metrics: [
          { label: "Cereal production", value: topCereal.cereal_production_mt!, unit: "count", of: null },
        ],
      });
    }
  }

  if (domain === "impact") {
    const addressable = picture.substitution_opportunities.reduce((s, o) => s + o.external_usd, 0);
    findings.push({
      title: "Substitution ceiling against the regional import bill",
      finding: `${usd(addressable)} of the region's ${usd(picture.totals.food_imports_usd)} food import bill is bought outside CARICOM on commodities a member state already supplies into it.`,
      recommendation:
        "Treat this as the ceiling on what coordination alone could move, and prioritise the largest pairs first.",
      evidence: [
        `${usd(addressable)} across ${picture.substitution_opportunities.length} pairs (UN Comtrade)`,
        `Currently ${picture.totals.intra_caricom_share_pct ?? "?"}% sourced regionally`,
      ],
      severity: "opportunity",
      confidence: "high",
      states: [],
      metrics: [
        { label: "Addressable by substitution", value: addressable, unit: "usd", of: picture.totals.food_imports_usd },
        { label: "Currently sourced regionally", value: picture.totals.intra_caricom_share_pct ?? 0, unit: "percent", of: 100 },
      ],
    });
  }

  for (const gap of picture.gaps.slice(0, 2)) {
    findings.push({
      title: "Source unavailable",
      finding: gap,
      recommendation: "Treat conclusions that depend on this source as provisional.",
      evidence: [gap],
      severity: "gap",
      confidence: "high",
      states: [],
      metrics: [],
    });
  }

  return {
    // Deliberately says only what these *are*. Why the agent has not answered
    // differs by case — no key, still reading, or a failed call — and that
    // belongs in `note`, which the caller sets; baking one reason in here made
    // the page claim "no model was available" while a model was mid-read.
    summary:
      "Deterministic findings over the same figures, in place of an agent reading.",
    findings,
  };
}

// ── Cache ─────────────────────────────────────────────────────────────────

const ANALYSIS_TTL_MS = 15 * 60 * 1000;
/** One retry: the malformation that causes a failure here rarely repeats. */
const ANALYSIS_ATTEMPTS = 2;
const ANALYSIS_RETRY_MS = 600;

/**
 * Drop the cached readings for the given domains.
 *
 * Fifteen minutes is the right cadence for a picture that changes slowly and
 * the wrong one for a decision an operator just took, so a finished
 * coordination run expires the domains it bears on and the next read rebuilds
 * them with it.
 */
export function expireAnalysis(domains: AnalysisDomain[]): void {
  const cache = globalAnalysis.__nexusGridAnalysis;
  if (!cache) return;
  for (const domain of domains) delete cache[domain];
}

const globalAnalysis = globalThis as typeof globalThis & {
  __nexusGridAnalysis?: Partial<Record<AnalysisDomain, { result: AnalysisResult; expiresAt: number }>>;
  __nexusGridAnalysisInflight?: Partial<Record<AnalysisDomain, Promise<AnalysisResult>>>;
};

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Whether the picture carries enough for a reading to mean anything. */
function hasEnough(domain: AnalysisDomain, inputs: AnalysisInputs): boolean {
  const { picture } = inputs;
  if (domain === "soil") return picture.states.some((s) => s.soil?.has_coverage || s.arable_land_pct !== null);
  if (domain === "planting") return picture.states.some((s) => s.rain_fed_months.length > 0);
  if (domain === "logistics") return (inputs.lanes?.length ?? 0) > 0;
  return picture.totals.states_covered > 0 && picture.totals.food_imports_usd > 0;
}

/** Run the model for one domain, falling back to rules on any failure. */
export async function analyse(
  domain: AnalysisDomain,
  inputs: AnalysisInputs
): Promise<AnalysisResult> {
  const generated_at = nowIso();
  const provider = resolveProvider();

  if (provider === null) {
    const { summary, findings } = ruleFindings(domain, inputs);
    return {
      domain,
      source: "rules",
      summary,
      findings,
      note: "No LLM API key configured — set MINIMAX_API_KEY or SHO_API_KEY to have an agent read this page.",
      generated_at,
    };
  }

  /**
   * Two attempts, because the failure is usually the model and not the input.
   *
   * What goes wrong here is a malformed object — an unquoted key, a trailing
   * comma — and it is intermittent: the same domain that fails once answers
   * cleanly on the next call. One retry converts most of those into a real
   * reading. Deliberately not a lenient parser: repairing broken JSON would
   * turn a visible failure into a quiet guess about what the model meant, and
   * every figure on these pages is supposed to be checkable.
   */
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= ANALYSIS_ATTEMPTS; attempt += 1) {
    try {
      const parsed = await callModelJson(
        provider,
        systemPrompt(domain),
        buildUserPrompt(domain, inputs)
      );
      const { summary, findings } = coerce(parsed);
      if (findings.length === 0) throw new Error("model returned no usable findings");
      return { domain, source: provider.name, summary, findings, generated_at };
    } catch (error) {
      lastError = error;
      if (attempt < ANALYSIS_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, ANALYSIS_RETRY_MS));
      }
    }
  }

  {
    const error = lastError;
    console.error(`Analysis failed for ${domain}`, error);
    const { summary, findings } = ruleFindings(domain, inputs);
    return {
      domain,
      source: "rules",
      summary,
      findings,
      note: `Analysis unavailable (${error instanceof Error ? error.message : String(error)}) — showing rule-derived findings.`,
      generated_at,
    };
  }
}

/**
 * Analysis, cached per domain and revalidated behind the request.
 *
 * A model round-trip over a domain's slice is far too slow to sit in a polling
 * loop and is billed per call, so readers get the last reading immediately
 * while a stale one refreshes, and concurrent readers share one in-flight call.
 */
export async function analyseCached(
  domain: AnalysisDomain,
  inputs: AnalysisInputs,
  force = false
): Promise<AnalysisResult> {
  globalAnalysis.__nexusGridAnalysis ??= {};
  globalAnalysis.__nexusGridAnalysisInflight ??= {};

  const cached = globalAnalysis.__nexusGridAnalysis[domain];

  const start = (): Promise<AnalysisResult> => {
    const existing = globalAnalysis.__nexusGridAnalysisInflight![domain];
    if (existing) return existing;

    const run = analyse(domain, inputs)
      .then((result) => {
        globalAnalysis.__nexusGridAnalysis![domain] = {
          result,
          expiresAt: Date.now() + ANALYSIS_TTL_MS,
        };
        return result;
      })
      .finally(() => {
        globalAnalysis.__nexusGridAnalysisInflight![domain] = undefined;
      });

    globalAnalysis.__nexusGridAnalysisInflight![domain] = run;
    return run;
  };

  if (force) return start();

  // Reading a domain whose sources have not arrived produces a confident
  // account of nothing — and would then be cached for fifteen minutes, long
  // after the data landed.
  if (!hasEnough(domain, inputs)) {
    const { summary, findings } = ruleFindings(domain, inputs);
    return {
      domain,
      source: "rules",
      summary,
      findings,
      note: "Waiting for upstream sources — showing rule-derived findings until they arrive.",
      generated_at: nowIso(),
    };
  }

  if (!cached) {
    // First read: start the call but do not block on it. A round-trip takes
    // ten seconds or more; the console's next poll picks the reading up.
    void start().catch(() => {
      /* falls back to rules until a call succeeds */
    });
    const { summary, findings } = ruleFindings(domain, inputs);
    return {
      domain,
      source: "rules",
      summary,
      findings,
      note: "The agent is reading this page — showing rule-derived findings until it returns.",
      generated_at: nowIso(),
    };
  }

  if (cached.expiresAt <= Date.now()) {
    void start().catch(() => {
      /* the previous reading stays served until a refresh succeeds */
    });
  }
  return cached.result;
}

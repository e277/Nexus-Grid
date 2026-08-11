/**
 * The interpretation layer: cross-source evidence in, coordination signals out.
 *
 * The model is given only the derived regional picture — never raw payloads —
 * and is asked for structured findings, each of which must cite the numbers it
 * rests on. That constraint is the point: a signal an operator cannot trace
 * back to an observed figure is not actionable, and this layer coordinates
 * systems it does not control, so its output has to be checkable.
 *
 * Without an API key the layer degrades to deterministic rule-derived signals
 * rather than returning nothing, and labels them as such.
 */

import { getSettings } from "../config";
import type { RegionalPicture } from "../projection";

const REQUEST_TIMEOUT_MS = 45_000;

export type SignalKind =
  | "import_substitution"
  | "climate_exposure"
  | "production_alignment"
  | "logistics"
  | "data_gap";

export interface CoordinationSignal {
  kind: SignalKind;
  title: string;
  /** What the platform observed, in one or two sentences. */
  finding: string;
  /** The coordination action this implies, and who would take it. */
  recommendation: string;
  /** The figures this rests on, so an operator can check it. */
  evidence: string[];
  confidence: "low" | "medium" | "high";
  states: string[];
}

export interface InterpretationResult {
  source: string;
  signals: CoordinationSignal[];
  /** Present when the model could not be reached. */
  note?: string;
  generated_at: string;
}

const SYSTEM_PROMPT = `You are the interpretation layer of a Caribbean food-system coordination platform.

You receive a regional picture assembled from public data: World Bank indicators, UN Comtrade trade flows, and live climate data across CARICOM member states. You do not collect this data and you cannot query anything else.

Your job is to find coordination opportunities that no single member state can see from its own systems — where what is grown, where it is needed, and how it moves fail to line up.

Rules:
- Ground every signal in figures present in the input. Never invent a number.
- Prefer findings that span two or more states, or two or more sources.
- Say what should change and who would act, not just what is true.
- If the data is too thin to support a claim, say so as a data_gap signal instead of guessing.

Return ONLY a JSON object of this exact shape, with no markdown fence and no prose:
{"signals":[{"kind":"import_substitution|climate_exposure|production_alignment|logistics|data_gap","title":"short title","finding":"what was observed","recommendation":"what should change and who acts","evidence":["figure with units and source"],"confidence":"low|medium|high","states":["ISO3"]}]}

Return between 3 and 6 signals, most consequential first.`;

function buildUserPrompt(picture: RegionalPicture): string {
  const states = picture.states
    .filter((s) => s.food_imports_usd > 0 || s.food_import_share_pct !== null)
    .map((s) =>
      [
        s.name,
        `food imports ${s.food_import_share_pct ?? "?"}% of merchandise imports (${s.year ?? "?"})`,
        `observed food import value $${s.food_imports_usd.toLocaleString()}`,
        `intra-CARICOM share ${s.intra_caricom_share_pct ?? "?"}%`,
        `arable land ${s.arable_land_pct ?? "?"}%`,
        `agriculture ${s.agriculture_value_added_pct ?? "?"}% of GDP`,
        `climate risk ${s.climate_risk ?? "unknown"}`,
      ].join("; ")
    )
    .join("\n");

  const opportunities = picture.substitution_opportunities
    .map(
      (o) =>
        `${o.importer} imports $${o.external_usd.toLocaleString()} of ${o.commodity} from outside CARICOM ` +
        `(${o.external_share_pct}% of its imports of that commodity; top external: ${o.top_external_partners.join(", ")}). ` +
        `Regional suppliers already shipping ${o.commodity} into CARICOM: ${o.regional_suppliers.join(", ")}.`
    )
    .join("\n");

  const climate = picture.climate.islands_at_risk
    .map((c) => `${c.island}: ${c.risk} — ${c.summary}`)
    .join("\n");

  const storms = picture.climate.active_storms
    .map((s) => `${s.name} (${s.classification}), ${s.intensity_kt ?? "?"}kt`)
    .join("\n");

  return `REGIONAL TOTALS (trade year ${picture.totals.trade_year ?? "unknown"})
Observed food imports across ${picture.totals.states_covered} member states: $${picture.totals.food_imports_usd.toLocaleString()}
Sourced from inside CARICOM: $${picture.totals.intra_caricom_usd.toLocaleString()} (${picture.totals.intra_caricom_share_pct ?? "?"}%)

MEMBER STATES
${states || "No state-level data available."}

IMPORT SUBSTITUTION CANDIDATES
${opportunities || "No substitution candidates in the trade data."}

CLIMATE EXPOSURE (next 3 days)
${climate || "No islands at elevated risk."}

ACTIVE STORMS
${storms || "None in the basin."}

DATA GAPS
${picture.gaps.join("\n") || "None."}`;
}

function resolveProvider() {
  const settings = getSettings();
  if (settings.minimaxApiKey) {
    return {
      apiKey: settings.minimaxApiKey,
      name: "minimax",
      baseUrl: settings.minimaxBaseUrl,
      model: settings.minimaxModel,
    };
  }
  if (settings.shoApiKey) {
    return {
      apiKey: settings.shoApiKey,
      name: "shogo",
      baseUrl: settings.shoBaseUrl || settings.minimaxBaseUrl,
      model: settings.shoModel || settings.minimaxModel,
    };
  }
  return null;
}

/** Strip reasoning blocks and code fences some models wrap JSON in. */
function extractJson(text: string): string {
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const fenced = withoutThinking.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : withoutThinking).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  return start !== -1 && end > start ? candidate.slice(start, end + 1) : candidate;
}

const VALID_KINDS: SignalKind[] = [
  "import_substitution",
  "climate_exposure",
  "production_alignment",
  "logistics",
  "data_gap",
];

function coerceSignals(parsed: unknown): CoordinationSignal[] {
  const raw = (parsed as { signals?: unknown[] })?.signals;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => entry as Record<string, unknown>)
    .filter((entry) => typeof entry.title === "string" && typeof entry.finding === "string")
    .map((entry) => ({
      kind: VALID_KINDS.includes(entry.kind as SignalKind)
        ? (entry.kind as SignalKind)
        : "production_alignment",
      title: String(entry.title),
      finding: String(entry.finding),
      recommendation: String(entry.recommendation ?? ""),
      evidence: Array.isArray(entry.evidence) ? entry.evidence.map(String) : [],
      confidence: ["low", "medium", "high"].includes(entry.confidence as string)
        ? (entry.confidence as CoordinationSignal["confidence"])
        : "medium",
      states: Array.isArray(entry.states) ? entry.states.map(String) : [],
    }));
}

/**
 * Deterministic fallback so the platform still says something useful when no
 * model is configured or the call fails. Labelled `rules` so it is never
 * mistaken for an interpretation.
 */
export function ruleSignals(picture: RegionalPicture): CoordinationSignal[] {
  const signals: CoordinationSignal[] = [];

  for (const opportunity of picture.substitution_opportunities.slice(0, 3)) {
    signals.push({
      kind: "import_substitution",
      title: `${opportunity.importer} sources ${opportunity.commodity.toLowerCase()} outside the region`,
      finding:
        `${opportunity.external_share_pct}% of ${opportunity.importer}'s ${opportunity.commodity.toLowerCase()} imports ` +
        `come from outside CARICOM, worth $${opportunity.external_usd.toLocaleString()}.`,
      recommendation:
        `Check whether ${opportunity.regional_suppliers.slice(0, 2).join(" or ")} can cover part of this volume ` +
        `before the next planting cycle is committed.`,
      evidence: [
        `$${opportunity.external_usd.toLocaleString()} external, $${opportunity.intra_usd.toLocaleString()} intra-regional (UN Comtrade)`,
        `Top external partners: ${opportunity.top_external_partners.join(", ")}`,
      ],
      confidence: "medium",
      states: [opportunity.importer_iso3],
    });
  }

  const atRisk = picture.climate.islands_at_risk.filter((c) => c.risk === "high");
  if (atRisk.length > 0) {
    signals.push({
      kind: "climate_exposure",
      title: `${atRisk.length} island(s) at high climate risk`,
      finding: atRisk.map((c) => `${c.island}: ${c.summary}`).join(" "),
      recommendation:
        "Hold or reroute outbound produce from these islands and confirm cold-chain capacity before dispatch.",
      evidence: atRisk.map((c) => `${c.island} — ${c.summary} (Open-Meteo)`),
      confidence: "high",
      states: atRisk.map((c) => c.country_iso3),
    });
  }

  for (const gap of picture.gaps) {
    signals.push({
      kind: "data_gap",
      title: "Source unavailable",
      finding: gap,
      recommendation: "Treat conclusions that depend on this source as provisional.",
      evidence: [gap],
      confidence: "high",
      states: [],
    });
  }

  return signals;
}

/** Interpret the regional picture into coordination signals. */
export async function interpret(picture: RegionalPicture): Promise<InterpretationResult> {
  const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const provider = resolveProvider();

  if (provider === null) {
    return {
      source: "rules",
      signals: ruleSignals(picture),
      note: "No LLM API key configured — showing deterministic rule-derived signals. Set MINIMAX_API_KEY or SHO_API_KEY to enable interpretation.",
      generated_at: generatedAt,
    };
  }

  try {
    const response = await fetch(`${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(picture) },
        ],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) throw new Error(`LLM responded ${response.status}`);

    const payload = (await response.json()) as {
      choices: { message: { content: string } }[];
    };
    const signals = coerceSignals(JSON.parse(extractJson(payload.choices[0].message.content)));

    if (signals.length === 0) throw new Error("model returned no usable signals");

    return { source: provider.name, signals, generated_at: generatedAt };
  } catch (error) {
    console.error("Interpretation failed", error);
    return {
      source: "rules",
      signals: ruleSignals(picture),
      note: `Interpretation unavailable (${error instanceof Error ? error.message : String(error)}); showing rule-derived signals.`,
      generated_at: generatedAt,
    };
  }
}

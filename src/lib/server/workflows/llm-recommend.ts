/**
 * The LLM recommendation step, asked for a schema rather than prose.
 *
 * The request asks for a schema, not free text. Performing surgery on prose —
 * strip
 * `<think>` blocks with a regex, split reasoning from answer on a pattern,
 * truncate the remainder to fit a card. That is guesswork about a string, and
 * it broke visibly — a model that opened with "let me create a hypothetical
 * example" produced a recommendation card full of its own deliberation.
 *
 * Asking for `json_schema` moves the parsing to the provider, so the console
 * renders named fields instead of inferring them. Not every OpenAI-compatible
 * endpoint honours the parameter, so a response that is not valid JSON is
 * still accepted and carried as prose with `structured: false` — degraded,
 * labelled, and never silently mis-parsed.
 */

import { getSettings, type Settings } from "../config";
import { dispatchStatus, type DispatchStatus } from "../dispatch/openclaw";
import { withSignalDefaults } from "./supply-rules";

const REQUEST_TIMEOUT_MS = 30_000;

/** What the model is asked to return. Every field is rendered somewhere. */
const RECOMMENDATION_SCHEMA = {
  type: "object",
  properties: {
    action: {
      type: "string",
      description: "One imperative sentence naming the coordination action to take.",
    },
    rationale: {
      type: "string",
      description: "Two or three sentences on why, citing the figures supplied.",
    },
    confidence: {
      type: "number",
      description: "0 to 1. How well the supplied context supports this action.",
    },
    risks: {
      type: "array",
      items: { type: "string" },
      description: "Named risks a human should weigh before approving. May be empty.",
    },
  },
  required: ["action", "rationale", "confidence", "risks"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT =
  "You are an autonomous Caribbean supply-chain coordination assistant. " +
  "You are given observed trade, climate and production figures for CARICOM member states. " +
  "Recommend one concrete coordination action. Reason only from the figures supplied; " +
  "do not invent quantities, prices, or parties that are not given.";

function buildUserPrompt(context: object): string {
  const c = withSignalDefaults(context) as unknown as Record<string, unknown>;
  const suppliers = Array.isArray(c.regional_suppliers)
    ? c.regional_suppliers.join(", ")
    : String(c.regional_suppliers ?? "none identified");

  // Written as observed facts rather than a placeholder template. The old
  // version shipped `{crop_name}`-style slots that were only sometimes
  // filled, and a model handed unfilled slots reasonably talks about the
  // template instead of the problem.
  return [
    `Event: ${c.event ?? "substitution_gap"}`,
    `Commodity: ${c.commodity ?? "unknown"}`,
    `Importing member state: ${c.importer ?? "unknown"}`,
    `Value sourced outside CARICOM: $${Number(c.external_usd ?? 0).toLocaleString()}`,
    `Share of that commodity's imports coming from outside: ${c.external_share_pct ?? "unknown"}%`,
    `Member states already supplying it into the region: ${suppliers || "none identified"}`,
    `Climate risk at the importing state: ${c.climate_risk ?? "unknown"}`,
    `Assessed gap severity: ${c.gap_severity ?? "unknown"}`,
    c.market_context ? `Market context: ${c.market_context}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface Recommendation {
  /** Provider that answered, or `stub` / `error`. */
  source: string;
  /** One-sentence action. */
  action: string;
  /** Why, in the model's words. */
  rationale: string;
  /** The model's own 0..1 confidence, when it returned one. */
  confidence: number | null;
  risks: string[];
  /** False when the provider ignored the schema and returned prose. */
  structured: boolean;
  notes?: string;
  error?: string;
  /** Whether a real delivery channel exists for whatever this leads to. */
  dispatch_channel?: DispatchStatus;
}

function resolveProviderConfig(settings: Settings): {
  apiKey: string | null;
  providerName: string | null;
  baseUrl: string;
  model: string;
} {
  if (settings.minimaxApiKey) {
    return {
      apiKey: settings.minimaxApiKey,
      providerName: "minimax",
      baseUrl: settings.minimaxBaseUrl,
      model: settings.minimaxModel,
    };
  }
  if (settings.shoApiKey) {
    return {
      apiKey: settings.shoApiKey,
      providerName: "shogo",
      baseUrl: settings.shoBaseUrl || settings.minimaxBaseUrl,
      model: settings.shoModel || settings.minimaxModel,
    };
  }
  return {
    apiKey: null,
    providerName: null,
    baseUrl: settings.minimaxBaseUrl,
    model: settings.minimaxModel,
  };
}

interface ChatCompletion {
  choices: { message: { content: string } }[];
}

function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/i, "").trim();
}

/** Pull the first JSON object out of a response that may be fenced or prefixed. */
function extractJson(text: string): unknown | null {
  const cleaned = stripThink(text);
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : cleaned).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function coerce(parsed: unknown, source: string): Recommendation | null {
  if (parsed === null || typeof parsed !== "object") return null;
  const r = parsed as Record<string, unknown>;
  if (typeof r.action !== "string" || !r.action.trim()) return null;

  const confidence =
    typeof r.confidence === "number" && Number.isFinite(r.confidence)
      ? Math.min(1, Math.max(0, r.confidence))
      : null;

  return {
    source,
    action: r.action.trim(),
    rationale: typeof r.rationale === "string" ? r.rationale.trim() : "",
    confidence,
    risks: Array.isArray(r.risks) ? r.risks.filter((x): x is string => typeof x === "string") : [],
    structured: true,
  };
}

export async function recommendSupplyResponse(context: object): Promise<Recommendation> {
  const settings = getSettings();
  const { apiKey, providerName, baseUrl, model } = resolveProviderConfig(settings);
  const channel = dispatchStatus();

  if (!apiKey) {
    return {
      source: "stub",
      action: "No LLM API key is configured.",
      rationale:
        "Set MINIMAX_API_KEY or SHO_API_KEY to have a model propose the coordination action. " +
        "The rule-derived assessment upstream still stands on its own.",
      confidence: null,
      risks: [],
      structured: false,
      notes: "Set MINIMAX_API_KEY or SHO_API_KEY in environment or .env.",
      dispatch_channel: channel,
    };
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(context) },
        ],
        temperature: 0.4,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "coordination_recommendation",
            schema: RECOMMENDATION_SCHEMA,
            strict: true,
          },
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`LLM responded ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as ChatCompletion;
    const content = payload.choices[0]?.message?.content ?? "";
    const structured = coerce(extractJson(content), providerName ?? "minimax");
    if (structured) return { ...structured, dispatch_channel: channel };

    // The provider ignored the schema. Keep the prose rather than discard a
    // real answer, but say that is what happened.
    const prose = stripThink(content);
    return {
      source: providerName ?? "minimax",
      action: prose.split(/(?<=[.!?])\s/)[0]?.slice(0, 200) || "Recommendation returned as prose.",
      rationale: prose,
      confidence: null,
      risks: [],
      structured: false,
      notes: "The provider did not honour the JSON schema; showing its prose response.",
      dispatch_channel: channel,
    };
  } catch (error) {
    console.error("LLM recommendation failed", error);
    return {
      source: "error",
      action: "Failed to generate a recommendation.",
      rationale: "",
      confidence: null,
      risks: [],
      structured: false,
      error: error instanceof Error ? error.message : String(error),
      dispatch_channel: channel,
    };
  }
}

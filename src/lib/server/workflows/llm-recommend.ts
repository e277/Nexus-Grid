/**
 * LLM recommendation step (direct MiniMax call) with OpenClaw runtime status.
 *
 * MiniMax exposes an OpenAI-compatible chat completions endpoint, so the
 * recommendation step talks to it directly over HTTP. OpenClaw is a separate
 * *agent runtime* — a Python-only client (a themed wrapper over the cmdop
 * SDK) with no JavaScript equivalent, so this runtime reports `unavailable`
 * here rather than pretending a dispatch channel exists. That status is what
 * the `execute` node uses to label a dispatch honestly as simulated.
 */

import { getSettings, type Settings } from "../config";
import { withSignalDefaults } from "../services/supply-rules";

const PROMPT_TEXT = `
You are an autonomous Caribbean supply-chain assistant.
You receive crop, farmer, market, weather, demand, and logistics context.
Provide a single recommended action and a short rationale for how to respond.

Crop: {crop_name}
Quantity: {quantity}
Farmer: {farmer_name}
Island: {island}
Event: {event}
Market context: {market_context}
Weather risk: {weather_risk}
Logistics status: {logistics_status}
Demand signal: {demand_signal}
`;

const REQUEST_TIMEOUT_MS = 30_000;

export interface Recommendation {
  source: string;
  recommendation: string;
  notes?: string;
  error?: string;
  openclaw_runtime?: string;
}

/**
 * Report the OpenClaw runtime state: ready, unconfigured, or unavailable.
 *
 * The runtime ships as a Python package only; there is no Node client to
 * load, so this is `unavailable` regardless of configuration. Kept as a
 * function so wiring a real runtime later is a one-line change.
 */
export function openclawRuntimeStatus(): "ready" | "unconfigured" | "unavailable" {
  return "unavailable";
}

function buildMessages(context: object): { role: string; content: string }[] {
  const filled = Object.entries(withSignalDefaults(context)).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    PROMPT_TEXT
  );
  return [
    { role: "system", content: "You are an autonomous Caribbean supply-chain assistant." },
    { role: "user", content: filled },
  ];
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

export async function recommendSupplyResponse(context: object): Promise<Recommendation> {
  const settings = getSettings();
  const { apiKey, providerName, baseUrl, model } = resolveProviderConfig(settings);

  if (!apiKey) {
    return {
      source: "stub",
      recommendation: "No LLM API key is configured.",
      notes: "Set MINIMAX_API_KEY or SHO_API_KEY in environment or .env.",
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
        messages: buildMessages(context),
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`LLM responded ${response.status}: ${await response.text()}`);
    }

    const payload = (await response.json()) as ChatCompletion;
    return {
      source: providerName ?? "minimax",
      recommendation: payload.choices[0].message.content,
      openclaw_runtime: openclawRuntimeStatus(),
    };
  } catch (error) {
    console.error("LLM recommendation failed", error);
    return {
      source: "error",
      recommendation: "Failed to generate a recommendation.",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

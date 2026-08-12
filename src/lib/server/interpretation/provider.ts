/**
 * The one place a model is called from on the read path.
 *
 * Both the regional signal layer and the per-page analyses talk to the same
 * OpenAI-compatible endpoint with the same failure semantics, so the provider
 * resolution, the JSON salvage and the timeout live here rather than being
 * written twice and drifting.
 */

import { getSettings } from "../config";

const REQUEST_TIMEOUT_MS = 45_000;

export interface Provider {
  apiKey: string;
  name: string;
  baseUrl: string;
  model: string;
}

export function resolveProvider(): Provider | null {
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

/**
 * Strip reasoning blocks and code fences some models wrap JSON in.
 *
 * Kept even though the call asks for `json_object`: providers honour that
 * inconsistently, and salvaging a good answer beats discarding it.
 */
export function extractJson(text: string): string {
  const withoutThinking = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const fenced = withoutThinking.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : withoutThinking).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  return start !== -1 && end > start ? candidate.slice(start, end + 1) : candidate;
}

/** One completion, returned as parsed JSON. Throws on anything unusable. */
export async function callModelJson(
  provider: Provider,
  systemPrompt: string,
  userPrompt: string
): Promise<unknown> {
  const response = await fetch(`${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`LLM responded ${response.status}`);

  const payload = (await response.json()) as { choices: { message: { content: string } }[] };
  const content = payload.choices[0]?.message?.content ?? "";
  return JSON.parse(extractJson(content));
}

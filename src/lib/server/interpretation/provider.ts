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
  if (start === -1) return candidate;

  // Scan to the brace that closes the first object, rather than to the last
  // brace in the text. Models routinely answer with the object and then keep
  // talking, and a span from the first "{" to the final "}" swallows that
  // trailing prose — one stray brace in it and the whole reading is discarded
  // for a page that had a perfectly good answer at the top.
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < candidate.length; i += 1) {
    const char = candidate[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    // Braces inside a string are text, not structure.
    if (inString) continue;

    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }

  // Unbalanced: hand back what was found and let the caller report the parse
  // failure, rather than inventing a closing brace.
  return candidate.slice(start);
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

/**
 * Environment-based application configuration.
 *
 * All runtime configuration is read from environment variables (or a local
 * .env file, which Next.js loads automatically) through a single typed
 * `Settings` object, so no other module needs to touch `process.env`.
 */

export interface Settings {
  appName: string;
  appVersion: string;
  environment: string;

  /**
   * LLM provider for the workflow's recommendation step. MiniMax exposes an
   * OpenAI-compatible chat completions endpoint, called directly with fetch
   * (see lib/server/workflows/llm-recommend.ts).
   */
  minimaxApiKey: string;
  minimaxBaseUrl: string;
  minimaxModel: string;

  shoApiKey: string;
  shoBaseUrl: string;
  shoModel: string;

  /** Agent runtime */
  skipAgentStartup: boolean;
  agentPollIntervalSeconds: number;

  rateLimitPerMinute: number;
}

function str(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function int(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

let cached: Settings | null = null;

/** Return the cached application settings instance. */
export function getSettings(): Settings {
  if (cached) return cached;
  cached = {
    appName: str("APP_NAME", "Nexus-Grid"),
    appVersion: str("APP_VERSION", "1.0"),
    environment: str("ENVIRONMENT", "development"),

    minimaxApiKey: str("MINIMAX_API_KEY", ""),
    minimaxBaseUrl: str("MINIMAX_BASE_URL", "https://api.minimax.io/v1"),
    minimaxModel: str("MINIMAX_MODEL", "MiniMax-M2"),

    shoApiKey: str("SHO_API_KEY", ""),
    shoBaseUrl: str("SHO_BASE_URL", ""),
    shoModel: str("SHO_MODEL", ""),

    skipAgentStartup: bool("SKIP_AGENT_STARTUP", false),
    agentPollIntervalSeconds: int("AGENT_POLL_INTERVAL_SECONDS", 10),

    rateLimitPerMinute: int("RATE_LIMIT_PER_MINUTE", 120),
  };
  return cached;
}

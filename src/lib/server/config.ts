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

  /**
   * Where the workflow checkpointer writes.
   *
   * A file path gives paused approval gates that survive a restart, which is
   * the difference between a gate a human can take an hour over and one that
   * dies with the process. Empty keeps everything in memory.
   */
  checkpointDbPath: string;

  /**
   * OpenClaw gateway, used by the `execute` node to actually deliver a plan.
   *
   * The gateway is a separate long-running process; this app talks to it over
   * its WebSocket control plane and posts approved plans into the dashboard
   * (Control UI) for an operator to read. Without a URL and token the node
   * reports `unconfigured` and the dispatch is labelled simulated rather than
   * pretending to have sent.
   */
  openclawGatewayUrl: string;
  openclawGatewayToken: string;
  /** Dashboard session a plan is posted into; `main` is the gateway's own. */
  openclawSessionKey: string;
  /** Gateway agent that session belongs to. */
  openclawAgentId: string;

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

    checkpointDbPath: str("CHECKPOINT_DB_PATH", ".nexus-grid/checkpoints.sqlite"),

    openclawGatewayUrl: str("OPENCLAW_GATEWAY_URL", ""),
    openclawGatewayToken: str("OPENCLAW_GATEWAY_TOKEN", ""),
    openclawSessionKey: str("OPENCLAW_SESSION_KEY", "main"),
    openclawAgentId: str("OPENCLAW_AGENT_ID", "main"),

    skipAgentStartup: bool("SKIP_AGENT_STARTUP", false),
    agentPollIntervalSeconds: int("AGENT_POLL_INTERVAL_SECONDS", 10),

    rateLimitPerMinute: int("RATE_LIMIT_PER_MINUTE", 120),
  };
  return cached;
}

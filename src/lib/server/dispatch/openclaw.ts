/**
 * Delivering an approved coordination plan through an OpenClaw gateway.
 *
 * OpenClaw is a separate long-running process that owns the channels a
 * ministry desk actually reads — Slack, WhatsApp, Signal, Telegram and the
 * rest — and exposes them over one HTTP tool surface. This app talks to that
 * surface; it does not embed the gateway.
 *
 * That distinction is deliberate. The `openclaw` npm package is the gateway
 * itself: 56 direct dependencies, ~365 packages installed, a CLI, an
 * onboarding wizard and a plugin SDK, designed to be run with `openclaw
 * onboard` and left running. Pulling it into a Next.js route handler would
 * multiply this app's dependency footprint thirtyfold to obtain one thing —
 * "send this text to that channel" — which the gateway already exposes as
 * `POST /tools/invoke`. Talking to the gateway over HTTP is how a separate
 * service is meant to use it.
 *
 * Nothing here invents a delivery. With no gateway configured the status is
 * `unconfigured` and the execute node labels its dispatch simulated, exactly
 * as before; a configured gateway that refuses the call is reported as a
 * failure, not swallowed.
 */

import { getSettings } from "../config";

const REQUEST_TIMEOUT_MS = 15_000;

export type DispatchStatus = "ready" | "unconfigured" | "unavailable";

export interface DispatchResult {
  /** `openclaw` when the gateway accepted it, `simulated` when there is none. */
  mode: "openclaw" | "simulated";
  status: "delivered" | "skipped" | "failed";
  target?: string;
  detail?: string;
}

/**
 * Whether a real dispatch channel is available.
 *
 * `unconfigured` is the honest default: a deployment with no gateway is not
 * broken, it simply has nowhere to send, and the console says so rather than
 * showing a plan as delivered.
 */
export function dispatchStatus(): DispatchStatus {
  const settings = getSettings();
  if (!settings.openclawGatewayUrl || !settings.openclawGatewayToken) return "unconfigured";
  if (!settings.openclawTarget) return "unconfigured";
  return "ready";
}

/** The message a desk receives — plain text, because every channel renders it. */
function composeMessage(plan: Record<string, unknown>, decision: string | null, note: string | null) {
  const lines = [
    `*Nexus-Grid coordination plan*`,
    `Action: ${String(plan.action ?? "monitor").replace(/_/g, " ")}`,
    `Priority: ${plan.priority ?? "normal"}`,
    `Directed at: ${plan.target ?? "—"}`,
  ];
  if (typeof plan.strategy === "string") lines.push("", plan.strategy);
  if (typeof plan.volume_at_stake_usd === "number") {
    lines.push("", `Value at stake: $${plan.volume_at_stake_usd.toLocaleString()}`);
  }
  if (decision) {
    lines.push("", `Human decision at the approval gate: ${decision}`);
    if (note) lines.push(`Operator note: ${note}`);
  }
  return lines.join("\n");
}

/**
 * Send a plan to the configured gateway.
 *
 * Uses the gateway's `POST /tools/invoke` endpoint with a bearer token. That
 * endpoint is full operator access on the gateway instance, so the token
 * belongs in the environment and the gateway belongs on a private ingress —
 * see OpenClaw's own security note on the endpoint.
 */
export async function dispatchPlan(params: {
  plan: Record<string, unknown>;
  decision: string | null;
  note: string | null;
  /** Ties the gateway session to this run, so replies thread sensibly. */
  threadId: string;
}): Promise<DispatchResult> {
  const status = dispatchStatus();
  if (status !== "ready") {
    return {
      mode: "simulated",
      status: "skipped",
      detail: "No OpenClaw gateway configured — set OPENCLAW_GATEWAY_URL, _TOKEN and _TARGET.",
    };
  }

  const settings = getSettings();
  const base = settings.openclawGatewayUrl.replace(/\/+$/, "");

  try {
    const response = await fetch(`${base}/tools/invoke`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.openclawGatewayToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tool: "message",
        args: {
          action: "send",
          to: settings.openclawTarget,
          message: composeMessage(params.plan, params.decision, params.note),
        },
        agentId: settings.openclawAgentId,
        // Re-delivering the same run must not re-notify the desk.
        idempotencyKey: `nexus-grid:${params.threadId}`,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        mode: "openclaw",
        status: "failed",
        target: settings.openclawTarget,
        detail: `Gateway responded ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      };
    }

    return { mode: "openclaw", status: "delivered", target: settings.openclawTarget };
  } catch (error) {
    // A delivery failure must not fail the run: the plan was still decided,
    // and the recovery step is what decides the follow-up.
    console.error("OpenClaw dispatch failed", error);
    return {
      mode: "openclaw",
      status: "failed",
      target: settings.openclawTarget,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

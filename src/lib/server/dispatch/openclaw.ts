/**
 * Delivering an approved coordination plan to the OpenClaw dashboard.
 *
 * OpenClaw is a separate long-running process that owns the channels a
 * ministry desk reads — and its own operator surface, the Control UI, served
 * on the gateway port. This app talks to that gateway; it does not embed it.
 *
 * That distinction is deliberate. The `openclaw` npm package is the gateway
 * itself: 56 direct dependencies, ~365 packages installed, a CLI, an
 * onboarding wizard and a plugin SDK, designed to be run with `openclaw
 * onboard` and left running. Pulling it into a Next.js route handler would
 * multiply this app's dependency footprint thirtyfold to obtain one thing —
 * "put this plan in front of an operator" — which the gateway already exposes
 * over its own protocol.
 *
 * Plans go to the **dashboard session**, not to a phone number. The gateway
 * method for that is `chat.inject`, which appends the plan to a session
 * transcript and broadcasts it to the Control UI: no agent run, no model call,
 * and no outbound channel delivery. A plan is a notice for an operator to
 * read, not a prompt for an agent to answer, and `chat.inject` is the one
 * gateway call that means exactly that.
 *
 * Nothing here invents a delivery. With no gateway configured the status is
 * `unconfigured` and the execute node labels its dispatch simulated, exactly
 * as before; a configured gateway that refuses the call is reported as a
 * failure, not swallowed.
 */

import { getSettings } from "../config";

const REQUEST_TIMEOUT_MS = 15_000;

/** The gateway protocol version this client speaks. */
const PROTOCOL_VERSION = 4;

export type DispatchStatus = "ready" | "unconfigured" | "unavailable";

export interface DispatchResult {
  /** `openclaw` when the gateway accepted it, `simulated` when there is none. */
  mode: "openclaw" | "simulated";
  status: "delivered" | "skipped" | "failed";
  /** Where it went — the dashboard session, when one took it. */
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
  return missingDispatchSettings().length === 0 ? "ready" : "unconfigured";
}

/** The environment variables required before a plan can be delivered. */
export const DISPATCH_SETTINGS = [
  {
    key: "OPENCLAW_GATEWAY_URL",
    describes:
      "Where the gateway is reachable, e.g. ws://127.0.0.1:18789. It must be a " +
      "loopback address: the gateway grants dashboard access to a shared-token " +
      "connection only from loopback, so the app runs in the gateway's own network " +
      "namespace (see docker-compose.yml)",
  },
  {
    key: "OPENCLAW_GATEWAY_TOKEN",
    describes: "The gateway's shared secret — full operator access, keep it out of source control",
  },
] as const;

/**
 * Which of them are still unset.
 *
 * Returned rather than folded into a boolean so the console can name the
 * missing value instead of telling an operator that something, somewhere, is
 * not configured.
 */
export function missingDispatchSettings(): string[] {
  const settings = getSettings();
  const present: Record<string, string> = {
    OPENCLAW_GATEWAY_URL: settings.openclawGatewayUrl,
    OPENCLAW_GATEWAY_TOKEN: settings.openclawGatewayToken,
  };
  return DISPATCH_SETTINGS.map((setting) => setting.key).filter((key) => !present[key]);
}

/** Everything the console needs to show the delivery channel's state. */
export function dispatchReadiness(): {
  status: DispatchStatus;
  session: string | null;
  agent_id: string;
  missing: { key: string; describes: string }[];
} {
  const settings = getSettings();
  const missing = missingDispatchSettings();
  return {
    status: missing.length === 0 ? "ready" : "unconfigured",
    // Never echo the token; the session is the useful half to confirm, because
    // it names the dashboard conversation a plan will appear in.
    session: missing.length === 0 ? settings.openclawSessionKey : null,
    agent_id: settings.openclawAgentId,
    missing: DISPATCH_SETTINGS.filter((setting) => missing.includes(setting.key)).map((s) => ({
      key: s.key,
      describes: s.describes,
    })),
  };
}

/** The message an operator reads — plain text, because every surface renders it. */
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
 * Threads already delivered, so re-running one does not repost to the desk.
 *
 * `chat.inject` takes no idempotency key — unlike the gateway's tool surface,
 * which deduplicated server-side — so the guarantee has to be kept here. It is
 * per-process and therefore lost on restart: a restart may repost a thread
 * that was already delivered. That is the honest limit of the mechanism, and
 * it is the safe direction to fail, since the alternative is silently dropping
 * a plan the desk never saw.
 */
const deliveredThreads = new Set<string>();
const MAX_REMEMBERED_THREADS = 500;

function rememberThread(threadId: string): void {
  // Bounded: a long-running process opens a new thread per coordination run,
  // and an unbounded set would grow with every one of them.
  if (deliveredThreads.size >= MAX_REMEMBERED_THREADS) {
    const oldest = deliveredThreads.values().next().value;
    if (oldest !== undefined) deliveredThreads.delete(oldest);
  }
  deliveredThreads.add(threadId);
}

/** Normalize a configured gateway URL to the WebSocket origin it speaks on. */
function gatewaySocketUrl(configured: string): string {
  const trimmed = configured.trim().replace(/\/+$/, "");
  if (trimmed.startsWith("http://")) return `ws://${trimmed.slice("http://".length)}`;
  if (trimmed.startsWith("https://")) return `wss://${trimmed.slice("https://".length)}`;
  return trimmed;
}

interface GatewayFrame {
  type?: string;
  id?: string;
  event?: string;
  ok?: boolean;
  payload?: unknown;
  error?: { code?: string; message?: string };
}

/**
 * Run one gateway conversation: handshake, then a single method call.
 *
 * The gateway protocol is a WebSocket control plane — it opens with a
 * `connect.challenge` event, and the first frame a client sends must be
 * `connect`. This is the whole client: one socket, one call, closed after.
 * Node 22 ships a global `WebSocket`, so this costs no dependency.
 */
function callGateway(params: {
  url: string;
  token: string;
  method: string;
  methodParams: Record<string, unknown>;
}): Promise<{ ok: true; payload: unknown } | { ok: false; detail: string }> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(params.url);
    } catch (error) {
      resolve({ ok: false, detail: error instanceof Error ? error.message : String(error) });
      return;
    }

    let settled = false;
    const finish = (outcome: { ok: true; payload: unknown } | { ok: false; detail: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // Already closing; the result stands either way.
      }
      resolve(outcome);
    };

    const timer = setTimeout(
      () => finish({ ok: false, detail: `Gateway did not answer within ${REQUEST_TIMEOUT_MS}ms` }),
      REQUEST_TIMEOUT_MS
    );

    const connectId = "connect-1";
    const callId = "call-1";
    const send = (id: string, method: string, methodParams: Record<string, unknown>) => {
      socket.send(JSON.stringify({ type: "req", id, method, params: methodParams }));
    };

    socket.addEventListener("error", () => {
      // The event carries no useful detail in Node; the close frame or the
      // timeout says more, so only claim what is known.
      finish({ ok: false, detail: `Could not reach the gateway at ${params.url}` });
    });

    socket.addEventListener("close", (event) => {
      finish({
        ok: false,
        detail: `Gateway closed the connection (${event.code}${event.reason ? `: ${event.reason}` : ""})`,
      });
    });

    socket.addEventListener("message", (event) => {
      let frame: GatewayFrame;
      try {
        frame = JSON.parse(String(event.data)) as GatewayFrame;
      } catch {
        return;
      }

      if (frame.type === "event" && frame.event === "connect.challenge") {
        send(connectId, "connect", {
          minProtocol: PROTOCOL_VERSION,
          maxProtocol: PROTOCOL_VERSION,
          // A backend service, which is what this is. The gateway grants this
          // client the operator scopes on a loopback connection authenticated
          // with the shared token, and nothing at all from anywhere else.
          client: {
            id: "gateway-client",
            version: getSettings().appVersion,
            platform: process.platform,
            mode: "backend",
          },
          role: "operator",
          scopes: ["operator.admin"],
          auth: { token: params.token },
        });
        return;
      }

      if (frame.type === "res" && frame.id === connectId) {
        if (!frame.ok) {
          finish({ ok: false, detail: `Gateway refused the connection: ${frameError(frame)}` });
          return;
        }
        send(callId, params.method, params.methodParams);
        return;
      }

      if (frame.type === "res" && frame.id === callId) {
        if (!frame.ok) {
          finish({ ok: false, detail: `${params.method} refused: ${frameError(frame)}` });
          return;
        }
        finish({ ok: true, payload: frame.payload });
      }
    });
  });
}

function frameError(frame: GatewayFrame): string {
  const message = frame.error?.message ?? "no reason given";
  // The one refusal a reader will hit and not understand: the shared token
  // only carries operator scopes over loopback, so a gateway addressed across
  // a container network authenticates fine and is then allowed nothing.
  if (message.includes("missing scope")) {
    return `${message} — a shared-token connection gets operator scopes only from loopback, so the app must reach the gateway on 127.0.0.1 (in Compose it shares the gateway's network namespace)`;
  }
  return message;
}

/**
 * Put a plan in front of an operator, in the OpenClaw dashboard.
 *
 * The plan is appended to the configured dashboard session and broadcast to
 * the Control UI. It starts no agent run and sends nothing to any channel: the
 * gateway's token is full operator access, so the gateway belongs on a private
 * ingress — see OpenClaw's own security note.
 */
export async function dispatchPlan(params: {
  plan: Record<string, unknown>;
  decision: string | null;
  note: string | null;
  /** Ties the delivery to this run, so re-running a thread does not repost. */
  threadId: string;
}): Promise<DispatchResult> {
  const status = dispatchStatus();
  if (status !== "ready") {
    return {
      mode: "simulated",
      status: "skipped",
      detail: "No OpenClaw gateway configured — set OPENCLAW_GATEWAY_URL and OPENCLAW_GATEWAY_TOKEN.",
    };
  }

  const settings = getSettings();
  const session = settings.openclawSessionKey;

  if (deliveredThreads.has(params.threadId)) {
    return {
      mode: "openclaw",
      status: "skipped",
      target: session,
      detail: "Already delivered for this thread — the desk is not notified twice.",
    };
  }

  const outcome = await callGateway({
    url: gatewaySocketUrl(settings.openclawGatewayUrl),
    token: settings.openclawGatewayToken,
    method: "chat.inject",
    methodParams: {
      sessionKey: session,
      message: composeMessage(params.plan, params.decision, params.note),
    },
  });

  if (!outcome.ok) {
    // A delivery failure must not fail the run: the plan was still decided,
    // and the recovery step is what decides the follow-up.
    console.error("OpenClaw dashboard dispatch failed", outcome.detail);
    return { mode: "openclaw", status: "failed", target: session, detail: outcome.detail };
  }

  rememberThread(params.threadId);
  return { mode: "openclaw", status: "delivered", target: session };
}

import { ensureBootstrapped } from "@/lib/server/bootstrap";
import { HttpError, jsonBody } from "@/lib/server/http";
import { newThreadId, streamRun, threadStatus } from "@/lib/server/workflows/orchestrator";
import type { SupplyState } from "@/lib/server/workflows/supply-chain-graph";
import { GATE_DECISIONS } from "@/lib/server/workflows/supply-chain-graph";
import { optionalBool, optionalInt, optionalString } from "@/lib/server/validation";
import { Command } from "@langchain/langgraph";

import { expireAnalysis } from "@/lib/server/interpretation/analysis";
import { recordCoordination } from "@/lib/server/observability/coordination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Run or resume the coordination loop, streaming each node as it completes.
 *
 * Each node is sent the moment it lands, so the console shows the run as it
 * trigger endpoint returned every update at once and the client replayed them
 * on timers. That looked live and was not — the pace was a constant, so a
 * thirty-second model call and an instant rule branch drew identically, and
 * nothing on screen was true until the whole run had finished.
 *
 * Server-sent events instead of a socket because the traffic is one-way and
 * short-lived: a run emits a handful of events and ends. There is nothing for
 * the client to say back mid-run except a gate decision, which is its own
 * request against the same thread.
 *
 * Not wrapped in `api()`: that helper serialises a return value to JSON, and
 * this hands back a live stream. Rate limiting is skipped for the same reason
 * a long poll would be — one request per run, held open.
 */
export async function POST(request: Request): Promise<Response> {
  ensureBootstrapped();

  let body: Record<string, unknown>;
  try {
    body = await jsonBody(request);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 400;
    return Response.json({ detail: "Request body must be valid JSON" }, { status });
  }

  const resumeThread = optionalString(body, "thread_id");
  const decision = optionalString(body, "decision");

  // A resume carries a thread and a decision; a fresh run carries the signal.
  let input: Partial<SupplyState> | Command;
  let threadId: string;

  if (resumeThread) {
    if (!decision || !GATE_DECISIONS.includes(decision as (typeof GATE_DECISIONS)[number])) {
      return Response.json(
        { detail: `decision must be one of: ${GATE_DECISIONS.join(", ")}` },
        { status: 422 }
      );
    }
    threadId = resumeThread;
    input = new Command({ resume: { decision, note: optionalString(body, "note") } });
  } else {
    threadId = newThreadId();
    const suppliers = body.regional_suppliers;
    input = {
      event: optionalString(body, "event") ?? undefined,
      commodity: optionalString(body, "commodity"),
      importer: optionalString(body, "importer"),
      importer_iso3: optionalString(body, "importer_iso3"),
      external_usd: optionalInt(body, "external_usd") ?? undefined,
      external_share_pct: optionalInt(body, "external_share_pct") ?? undefined,
      regional_suppliers: Array.isArray(suppliers) ? suppliers.map(String) : undefined,
      climate_risk: optionalString(body, "climate_risk") ?? undefined,
      market_context: optionalString(body, "market_context") ?? undefined,
      require_approval:
        body.require_approval === undefined || body.require_approval === null
          ? undefined
          : optionalBool(body, "require_approval", false),
      thread_id: threadId,
    };
    for (const key of Object.keys(input) as (keyof SupplyState)[]) {
      if (input[key] === undefined || input[key] === null) delete input[key];
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send("started", { thread_id: threadId, started_at: new Date().toISOString() });

        let last: Record<string, unknown> = {};
        for await (const item of streamRun(input, threadId)) {
          if (item.value && typeof item.value === "object") {
            last = item.value as Record<string, unknown>;
          }
          send("node", { node: item.node, update: item.update, value: item.value });
        }

        const paused = await threadStatus(threadId);

        // A run that reached the end has concluded something about a gap, and
        // the domain readings are entitled to know it. A run parked at the
        // gate has not: the decision it is waiting for is the conclusion.
        if (!paused.paused) {
          recordRunOutcome(threadId, last);
        }

        send("finished", {
          thread_id: threadId,
          status: paused.paused ? "awaiting_approval" : "completed",
          interrupt: paused.interrupt,
        });
      } catch (error) {
        console.error("Streamed workflow failed", error);
        send("failed", {
          thread_id: threadId,
          detail: error instanceof Error ? error.message : String(error),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Proxies that buffer would defeat the point of streaming at all.
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * File a finished run where the domain readings can see it.
 *
 * Failing to record must not fail the run: the operator's plan was decided and
 * possibly delivered, and losing a line of context for a later reading is not
 * worth throwing that away.
 */
function recordRunOutcome(threadId: string, value: Record<string, unknown>) {
  try {
    const plan = (value.plan_data ?? {}) as Record<string, unknown>;
    const execution = (value.execution ?? {}) as Record<string, unknown>;

    recordCoordination({
      thread_id: threadId,
      commodity: String(value.commodity ?? "unspecified commodity"),
      importer: String(value.importer ?? "unspecified state"),
      importer_iso3: String(value.importer_iso3 ?? ""),
      decision: String(value.decision ?? "monitor"),
      action: String(plan.action ?? "monitor"),
      priority: String(plan.priority ?? "normal"),
      gate_decision: (value.gate_decision as string | undefined) ?? null,
      gate_note: (value.gate_note as string | undefined) ?? null,
      dispatch_status: (execution.dispatch_status as string | undefined) ?? null,
      external_usd: Number(value.external_usd ?? 0),
      concluded_at: new Date().toISOString(),
    });

    // The readings are cached for fifteen minutes, which is the right cadence
    // for a picture that changes slowly and the wrong one for a decision an
    // operator just took. Expiring the domains this bears on makes the next
    // page read include it.
    expireAnalysis(["market", "planting", "logistics", "impact"]);
  } catch (error) {
    console.error("Could not record the coordination outcome", error);
  }
}

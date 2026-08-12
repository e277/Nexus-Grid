import { api, jsonBody } from "@/lib/server/http";
import { resumeRun } from "@/lib/server/workflows/orchestrator";
import { GATE_DECISIONS } from "@/lib/server/workflows/supply-chain-graph";
import { optionalString, requiredEnum } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Continue a run paused at the approval gate (see orchestrator.resumeRun). */
export const POST = api<{ threadId: string }>(
  async ({ request, params }) => {
    const body = await jsonBody(request);
    const decision = requiredEnum(body, "decision", GATE_DECISIONS);
    // Carries the amendment on `modified` and the reason on `escalated`; the
    // graph records it against the gate either way.
    const note = optionalString(body, "note");

    return {
      status: "resumed",
      decision,
      note,
      result: await resumeRun(params.threadId, decision, note),
    };
  },
  {
    // Four outcomes at this gate are four different events, and the route path
    // cannot tell them apart — so the audit trail takes the decision itself.
    audit: (result) => {
      const { decision, note } = result as { decision?: string; note?: string | null };
      return decision ? { action: `workflow.gate_${decision}`, detail: note ?? undefined } : null;
    },
  }
);

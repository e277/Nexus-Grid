import { api, jsonBody } from "@/lib/server/http";
import { resumeRun } from "@/lib/server/workflows/orchestrator";
import { requiredEnum } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DECISIONS = ["approved", "rejected"] as const;

/** Continue a run paused at the approval gate (see orchestrator.resumeRun). */
export const POST = api<{ threadId: string }>(async ({ request, params }) => {

  const body = await jsonBody(request);
  const decision = requiredEnum(body, "decision", DECISIONS);
  return { status: "resumed", result: await resumeRun(params.threadId, decision) };
});

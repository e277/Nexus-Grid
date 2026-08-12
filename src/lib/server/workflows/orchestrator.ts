/** Entry points for running and resuming the supply-chain workflow graph. */

import { randomUUID } from "node:crypto";

import { utcnowIso } from "../time";
import type { Command } from "./graph";
import { getGraph, type GateDecision, type SupplyState } from "./supply-chain-graph";

export interface WorkflowRunResult {
  status: "completed" | "awaiting_approval" | "failed";
  thread_id: string;
  started_at: string;
  finished_at: string;
  updates: Record<string, Partial<SupplyState>>[];
  /** Full state after each node; a failed run appends the error instead. */
  values: (SupplyState | { error: string })[];
  interrupt?: unknown;
  input?: Record<string, unknown>;
}

/**
 * Drive the graph to completion or its next pause point.
 *
 * Shared by `runOnce` (fresh input) and `resumeRun` (a resume command) —
 * both drive the same checkpointed thread, so a paused run's state carries
 * over between the two.
 */
async function run(
  input: Partial<SupplyState> | Command,
  threadId: string
): Promise<WorkflowRunResult> {
  const startedAt = utcnowIso();
  let status: WorkflowRunResult["status"] = "completed";
  let updates: Record<string, Partial<SupplyState>>[] = [];
  let values: WorkflowRunResult["values"] = [];
  let interruptPayload: unknown = null;

  try {
    const outcome = await getGraph().run(threadId, input);
    updates = outcome.updates;
    values = outcome.values;

    if (outcome.next !== null) {
      status = "awaiting_approval";
      interruptPayload = outcome.interrupt;
    }
  } catch (error) {
    console.error("Workflow execution failed", error);
    status = "failed";
    values = [...values, { error: error instanceof Error ? error.message : String(error) }];
  }

  const result: WorkflowRunResult = {
    status,
    thread_id: threadId,
    started_at: startedAt,
    finished_at: utcnowIso(),
    updates,
    values,
  };
  if (interruptPayload !== null) result.interrupt = interruptPayload;
  return result;
}

/**
 * Run the workflow once and collect its state transitions.
 *
 * Each run gets its own checkpointer thread id (unless one is supplied to
 * resume a prior thread), so run history is inspectable via the graph's
 * checkpointer. If the run reaches the approval gate, it stops there with
 * `status: "awaiting_approval"` — see `resumeRun`.
 */
export async function runOnce(
  context: Partial<SupplyState> | null = null,
  threadId: string | null = null
): Promise<WorkflowRunResult> {
  const input = context ? { ...context } : {};
  const result = await run(input, threadId ?? randomUUID().replaceAll("-", ""));
  result.input = input as Record<string, unknown>;
  return result;
}

/**
 * Continue a thread paused at the approval gate with a human decision.
 *
 * The decision and any operator note are delivered together to the
 * `interrupt()` call inside `holdForApproval` (see `supply-chain-graph.ts`),
 * which is the only place either is interpreted.
 */
export function resumeRun(
  threadId: string,
  decision: GateDecision,
  note: string | null = null
): Promise<WorkflowRunResult> {
  return run({ resume: { decision, note } }, threadId);
}

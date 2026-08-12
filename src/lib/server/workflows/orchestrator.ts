/** Entry points for running, streaming and resuming the supply-chain workflow. */

import { randomUUID } from "node:crypto";

import { Command } from "@langchain/langgraph";

import { utcnowIso } from "../time";
import { getGraph, type GateDecision, type SupplyState } from "./supply-chain-graph";

export interface WorkflowRunResult {
  status: "completed" | "awaiting_approval" | "failed";
  thread_id: string;
  started_at: string;
  finished_at: string;
  /** One entry per completed node: `{ [nodeName]: partialUpdate }`. */
  updates: Record<string, Partial<SupplyState>>[];
  /** Full state after each node; a failed run appends the error instead. */
  values: (SupplyState | { error: string })[];
  interrupt?: unknown;
  input?: Record<string, unknown>;
}

/** One node completing, as it happens. */
export interface RunEvent {
  node: string;
  update: Partial<SupplyState>;
  /** Full state after this node. */
  value: SupplyState;
}

function threadConfig(threadId: string) {
  return { configurable: { thread_id: threadId } };
}

/**
 * Drive the graph, yielding each node as it finishes.
 *
 * `updates` is LangGraph's own stream mode and emits exactly
 * `{ [node]: partialUpdate }`, which is the shape the console already reads —
 * so live progress and the collected result describe a run the same way.
 *
 * State is rebuilt here by merging updates rather than asking for the
 * `values` mode as well. Every channel in the graph is last-write-wins, so a
 * merge reproduces the state exactly, and one stream mode keeps the event
 * order unambiguous.
 */
export async function* streamRun(
  input: Partial<SupplyState> | Command,
  threadId: string
): AsyncGenerator<RunEvent> {
  const graph = getGraph();
  let merged = {} as SupplyState;

  const stream = await graph.stream(input as never, {
    ...threadConfig(threadId),
    streamMode: "updates",
  });

  for await (const chunk of stream) {
    for (const [node, update] of Object.entries(chunk as Record<string, unknown>)) {
      // LangGraph reports the pause itself under `__interrupt__`; that is not
      // a node completing, and the caller reads it from the checkpoint.
      if (node.startsWith("__")) continue;
      const partial = (update ?? {}) as Partial<SupplyState>;
      merged = { ...merged, ...partial };
      yield { node, update: partial, value: { ...merged } };
    }
  }
}

/** Whether the thread is parked at an interrupt, and what it is waiting on. */
async function pauseState(threadId: string): Promise<{ paused: boolean; interrupt: unknown }> {
  const snapshot = await getGraph().getState(threadConfig(threadId));
  const pending = snapshot.tasks?.flatMap((task) => task.interrupts ?? []) ?? [];
  return {
    paused: (snapshot.next?.length ?? 0) > 0,
    interrupt: pending.length > 0 ? pending[pending.length - 1].value : null,
  };
}

/** Drive the graph to completion or its next pause point, collecting the run. */
async function run(
  input: Partial<SupplyState> | Command,
  threadId: string
): Promise<WorkflowRunResult> {
  const startedAt = utcnowIso();
  const updates: Record<string, Partial<SupplyState>>[] = [];
  const values: WorkflowRunResult["values"] = [];
  let status: WorkflowRunResult["status"] = "completed";
  let interruptPayload: unknown = null;

  try {
    for await (const event of streamRun(input, threadId)) {
      updates.push({ [event.node]: event.update });
      values.push(event.value);
    }
    const paused = await pauseState(threadId);
    if (paused.paused) {
      status = "awaiting_approval";
      interruptPayload = paused.interrupt;
    }
  } catch (error) {
    console.error("Workflow execution failed", error);
    status = "failed";
    values.push({ error: error instanceof Error ? error.message : String(error) });
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

export function newThreadId(): string {
  return randomUUID().replaceAll("-", "");
}

/**
 * Run the workflow once and collect its state transitions.
 *
 * Each run gets its own thread id unless one is supplied, so run history stays
 * inspectable through the checkpointer. If the run reaches the approval gate
 * it stops there with `status: "awaiting_approval"` — see `resumeRun`.
 */
export async function runOnce(
  context: Partial<SupplyState> | null = null,
  threadId: string | null = null
): Promise<WorkflowRunResult> {
  const id = threadId ?? newThreadId();
  // Carried in state so `execute` can key an idempotent dispatch to this run.
  const input = { ...(context ?? {}), thread_id: id };
  const result = await run(input, id);
  result.input = input as Record<string, unknown>;
  return result;
}

/**
 * Continue a thread paused at the approval gate with a human decision.
 *
 * The decision and any operator note are delivered together to the
 * `interrupt()` call inside `holdForApproval`, which is the only place either
 * is interpreted.
 */
export function resumeRun(
  threadId: string,
  decision: GateDecision,
  note: string | null = null
): Promise<WorkflowRunResult> {
  return run(new Command({ resume: { decision, note } }), threadId);
}

/** Whether a thread is still resumable — a paused gate survives a restart. */
export async function threadStatus(
  threadId: string
): Promise<{ paused: boolean; interrupt: unknown }> {
  return pauseState(threadId);
}

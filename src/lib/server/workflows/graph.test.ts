/**
 * The graph runtime replaced LangGraph, so its interrupt/resume semantics are
 * load-bearing and worth pinning down: the human approval gate is the one
 * point where a run is not autonomous, and a regression there would look like
 * a run that either never pauses or never continues.
 */

import { describe, expect, it } from "vitest";

import { MemoryCheckpointer, StateGraph, type NodeContext } from "./graph";

interface TestState {
  trail?: string[];
  branch?: string;
  decision?: unknown;
  value?: number;
}

function append(state: TestState, name: string): Partial<TestState> {
  return { trail: [...(state.trail ?? []), name] };
}

describe("StateGraph", () => {
  it("runs nodes in edge order and merges partial updates", async () => {
    const graph = new StateGraph<TestState>()
      .addNode("a", (s) => append(s, "a"))
      .addNode("b", (s) => ({ ...append(s, "b"), value: 42 }))
      .setEntryPoint("a")
      .addEdge("a", "b")
      .compile(new MemoryCheckpointer<TestState>());

    const outcome = await graph.run("t1", {});

    expect(outcome.next).toBeNull();
    expect(outcome.updates.map((u) => Object.keys(u)[0])).toEqual(["a", "b"]);
    expect(outcome.values.at(-1)).toMatchObject({ trail: ["a", "b"], value: 42 });
  });

  it("follows conditional edges based on state", async () => {
    const graph = new StateGraph<TestState>()
      .addNode("start", () => ({ branch: "left" }))
      .addNode("left", (s) => append(s, "left"))
      .addNode("right", (s) => append(s, "right"))
      .setEntryPoint("start")
      .addConditionalEdges("start", (s) => s.branch ?? "right", {
        left: "left",
        right: "right",
      })
      .compile(new MemoryCheckpointer<TestState>());

    const outcome = await graph.run("t2", {});
    expect(outcome.updates.map((u) => Object.keys(u)[0])).toEqual(["start", "left"]);
  });

  it("halts at interrupt(), checkpointing the state from before the node", async () => {
    const graph = new StateGraph<TestState>()
      .addNode("before", (s) => append(s, "before"))
      .addNode("gate", (s: TestState, ctx: NodeContext) => {
        const decision = ctx.interrupt({ awaiting: true });
        return { ...append(s, "gate"), decision };
      })
      .addNode("after", (s) => append(s, "after"))
      .setEntryPoint("before")
      .addEdge("before", "gate")
      .addEdge("gate", "after")
      .compile(new MemoryCheckpointer<TestState>());

    const held = await graph.run("t3", {});

    expect(held.next).toBe("gate");
    expect(held.interrupt).toEqual({ awaiting: true });
    // The paused node must not appear in updates — it did not complete.
    expect(held.updates.map((u) => Object.keys(u)[0])).toEqual(["before"]);
  });

  it("resumes the same thread, re-entering the node with the decision", async () => {
    const graph = new StateGraph<TestState>()
      .addNode("before", (s) => append(s, "before"))
      .addNode("gate", (s: TestState, ctx: NodeContext) => {
        const decision = ctx.interrupt({ awaiting: true });
        return { ...append(s, "gate"), decision };
      })
      .addNode("after", (s) => append(s, "after"))
      .setEntryPoint("before")
      .addEdge("before", "gate")
      .addEdge("gate", "after")
      .compile(new MemoryCheckpointer<TestState>());

    await graph.run("t4", {});
    const resumed = await graph.run("t4", { resume: "approved" });

    expect(resumed.next).toBeNull();
    expect(resumed.updates.map((u) => Object.keys(u)[0])).toEqual(["gate", "after"]);
    expect(resumed.values.at(-1)).toMatchObject({
      decision: "approved",
      // State from before the pause carried across the resume.
      trail: ["before", "gate", "after"],
    });
  });

  it("refuses to resume a thread that is not paused", async () => {
    const graph = new StateGraph<TestState>()
      .addNode("only", (s) => append(s, "only"))
      .setEntryPoint("only")
      .compile(new MemoryCheckpointer<TestState>());

    await graph.run("t5", {});
    await expect(graph.run("t5", { resume: "approved" })).rejects.toThrow(/No paused run/);
  });

  it("does not consume a resume value on a later interrupt", async () => {
    // Two gates: resuming should satisfy the first and pause again at the
    // second, rather than sliding the same decision into both.
    const graph = new StateGraph<TestState>()
      .addNode("gate1", (_s, ctx: NodeContext) => ({ decision: ctx.interrupt("first") }))
      .addNode("gate2", (_s, ctx: NodeContext) => ({ decision: ctx.interrupt("second") }))
      .setEntryPoint("gate1")
      .addEdge("gate1", "gate2")
      .compile(new MemoryCheckpointer<TestState>());

    await graph.run("t6", {});
    const resumed = await graph.run("t6", { resume: "approved" });

    expect(resumed.next).toBe("gate2");
    expect(resumed.interrupt).toBe("second");
  });
});

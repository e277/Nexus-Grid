/**
 * The approval gate is the one point where a run is not autonomous, so its
 * interrupt/resume semantics are load-bearing: a regression there looks like a
 * run that either never pauses or never continues.
 *
 * These test the *supply-chain graph*, not the runtime under it. The runtime
 * is now LangGraph and testing it here would only assert that a dependency
 * works; what has to hold is that this graph pauses on an urgent plan, carries
 * a human's four possible answers through to recovery, survives being
 * recompiled against the same checkpointer, and re-plans at most once.
 */

import { MemorySaver } from "@langchain/langgraph";
import { Command } from "@langchain/langgraph";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The recommend node calls a model; stub it so these stay offline and fast.
vi.mock("./llm-recommend", () => ({
  recommendSupplyResponse: vi.fn(async () => ({
    source: "stub",
    action: "Open a regional supply line.",
    rationale: "stubbed",
    confidence: 0.5,
    risks: [],
    structured: true,
  })),
}));

// No gateway in tests: dispatch must report "nowhere to send", not invent one.
vi.mock("../dispatch/openclaw", () => ({
  dispatchStatus: () => "unconfigured",
  dispatchPlan: vi.fn(async () => ({
    mode: "simulated",
    status: "skipped",
    detail: "No OpenClaw gateway configured.",
  })),
}));

import { dispatchPlan } from "../dispatch/openclaw";
import { buildGraph } from "./supply-chain-graph";

/** A gap big enough to be classified critical, so the plan is urgent. */
const CRITICAL_GAP = {
  event: "substitution_gap",
  commodity: "Cereals",
  importer: "Guyana",
  importer_iso3: "GUY",
  external_usd: 190_000_000,
  external_share_pct: 100,
  regional_suppliers: ["Jamaica", "Trinidad and Tobago"],
  climate_risk: "low",
  require_approval: true,
};

function compile(saver = new MemorySaver()) {
  return { app: buildGraph().compile({ checkpointer: saver }), saver };
}

let counter = 0;
const nextThread = () => ({ configurable: { thread_id: `t${(counter += 1)}` } });

beforeEach(() => {
  vi.mocked(dispatchPlan).mockClear();
});

describe("supply-chain graph", () => {
  it("runs the loop end to end when no approval is required", async () => {
    const { app } = compile();
    const cfg = nextThread();

    const out = await app.invoke({ ...CRITICAL_GAP, require_approval: false }, cfg);

    expect(out.gap_severity).toBe("critical");
    expect(out.decision).toBe("coordinate_substitution");
    expect(out.execution?.status).toBe("scheduled");
    expect(out.recovery?.recovery_action).toBe("activate_followup");
    expect((await app.getState(cfg)).next).toEqual([]);
  });

  it("halts at the gate on an urgent plan, without running execute", async () => {
    const { app } = compile();
    const cfg = nextThread();

    const held = await app.invoke(CRITICAL_GAP, cfg);
    const snapshot = await app.getState(cfg);

    expect(snapshot.next).toEqual(["hold"]);
    // `__interrupt__` rides alongside the state channels rather than in them.
    const raised = (held as { __interrupt__?: { value: unknown }[] }).__interrupt__;
    expect(raised?.[0]?.value).toMatchObject({ phase: "hold" });
    // The paused node did not complete, so nothing downstream ran.
    expect(held.execution).toBeUndefined();
    expect(dispatchPlan).not.toHaveBeenCalled();
  });

  it.each([
    ["approved", "activate_followup", "notify_supply_chain_ops", true],
    ["modified", "activate_followup", "notify_supply_chain_ops", true],
    ["rejected", "plan_rejected", "await_revised_plan", false],
    ["escalated", "escalated_for_decision", "await_higher_authority", false],
  ])(
    "carries a %s decision through to recovery",
    async (decision, recoveryAction, nextStep, delivers) => {
      const { app } = compile();
      const cfg = nextThread();

      await app.invoke(CRITICAL_GAP, cfg);
      const out = await app.invoke(
        new Command({ resume: { decision, note: "because" } }),
        cfg
      );

      expect(out.gate_decision).toBe(decision);
      expect(out.gate_note).toBe("because");
      expect(out.recovery?.recovery_action).toBe(recoveryAction);
      expect(out.recovery?.next_step).toBe(nextStep);
      expect((await app.getState(cfg)).next).toEqual([]);

      // The gate decides whether the plan is delivered, and `execute` is what
      // delivers it — so an approved plan goes through that node and out, and
      // a refused one goes through it and no further. Routing the gate
      // straight to recovery instead skipped delivery for every answer, which
      // made approving a plan indistinguishable from rejecting it.
      expect(dispatchPlan).toHaveBeenCalledTimes(delivers ? 1 : 0);
      expect(out.execution?.status).toBe(delivers ? "scheduled" : "not_executed");
    }
  );

  it("keeps a paused gate resumable across a recompiled graph", async () => {
    // Standing in for a restart: same checkpointer, brand new compiled graph.
    const saver = new MemorySaver();
    const cfg = nextThread();

    await compile(saver).app.invoke(CRITICAL_GAP, cfg);

    const { app: revived } = compile(saver);
    const recovered = await revived.getState(cfg);
    expect(recovered.next).toEqual(["hold"]);
    expect(recovered.tasks?.[0]?.interrupts?.[0]?.value).toMatchObject({ phase: "hold" });

    const out = await revived.invoke(new Command({ resume: { decision: "approved" } }), cfg);
    expect(out.gate_decision).toBe("approved");
  });

  it("re-plans at most once when the importer is under climate risk", async () => {
    const { app } = compile();
    const cfg = nextThread();

    const out = await app.invoke(
      { ...CRITICAL_GAP, require_approval: false, climate_risk: "high" },
      cfg
    );

    expect(out.replan_count).toBe(1);
    // The signal is downgraded on re-plan so the loop converges.
    expect(out.climate_risk).toBe("replanned");
    expect(out.monitor_result?.will_replan).toBe(false);
    expect((await app.getState(cfg)).next).toEqual([]);
  });

  it("reports a simulated dispatch rather than claiming delivery", async () => {
    const { app } = compile();
    const cfg = nextThread();

    const out = await app.invoke({ ...CRITICAL_GAP, require_approval: false }, cfg);

    expect(dispatchPlan).toHaveBeenCalledTimes(1);
    expect(out.execution?.dispatch_mode).toBe("simulated");
    expect(out.execution?.dispatch_status).toBe("skipped");
    expect(out.execution?.dispatch_channel).toBe("unconfigured");
  });
});

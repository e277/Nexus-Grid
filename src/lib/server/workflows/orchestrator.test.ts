/**
 * `threadStatus` is what the resume routes check before applying a decision.
 *
 * LangGraph will happily "resume" a thread it holds no checkpoint for: it runs
 * nothing and reports completion. On a serverless deployment, where a decision
 * can reach an instance that never saw the run, that read as an approved plan
 * that had in fact gone nowhere. These pin the signal the routes rely on to
 * refuse it instead.
 */

import { describe, expect, it, vi } from "vitest";

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

vi.mock("../dispatch/openclaw", () => ({
  dispatchStatus: () => "unconfigured",
  dispatchPlan: vi.fn(async () => ({
    mode: "simulated",
    status: "skipped",
    detail: "No OpenClaw gateway configured.",
  })),
}));

// In-memory, as on Vercel: the case where a checkpoint can be missing.
process.env.CHECKPOINT_DB_PATH = "";

const { resumeRun, runOnce, threadStatus } = await import("./orchestrator");

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

describe("threadStatus as the resume guard", () => {
  it("reports a thread this process never ran as not awaiting a decision", async () => {
    expect((await threadStatus("never-seen-here")).paused).toBe(false);
  });

  it("reports a run parked at the gate as awaiting, and not once it is decided", async () => {
    const run = await runOnce(CRITICAL_GAP);
    expect(run.status).toBe("awaiting_approval");
    expect((await threadStatus(run.thread_id)).paused).toBe(true);

    await resumeRun(run.thread_id, "approved");
    // A second decision on the same run must be refused, not re-reported.
    expect((await threadStatus(run.thread_id)).paused).toBe(false);
  });
});

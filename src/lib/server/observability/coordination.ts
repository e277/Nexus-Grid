/**
 * What the coordination loop concluded, kept so the domain readings can see it.
 *
 * The agents' readings and a sweep were two systems that never met: a run
 * produced a plan, a gate decision and a dispatch, and none of it reached the
 * pages that describe the region. An operator could approve a substitution and
 * find Farm-to-Market Intelligence describing the same gap as though nothing
 * had been decided about it.
 *
 * Audit logs could not carry this. They record HTTP requests — actor, action,
 * detail — so a gate decision appears as a route name and the commodity it was
 * about does not appear at all.
 *
 * Bounded and in memory, like the agents' own recall. These are the recent
 * decisions a reading should take account of, not a ledger: the durable record
 * of a run is its checkpoint, and the durable record of a decision is the audit
 * log.
 */

const LIMIT = 60;

export interface CoordinationOutcome {
  thread_id: string;
  commodity: string;
  importer: string;
  importer_iso3: string;
  /** What `assess` concluded: substitution, staggered planting, monitor. */
  decision: string;
  /** The action the plan settled on. */
  action: string;
  priority: string;
  /** Present only when a human answered at the gate. */
  gate_decision: string | null;
  gate_note: string | null;
  /** `delivered`, `skipped` or `failed` — whether it reached anyone. */
  dispatch_status: string | null;
  external_usd: number;
  concluded_at: string;
}

const globalCoordination = globalThis as typeof globalThis & {
  __nexusGridCoordination?: CoordinationOutcome[];
};

function store(): CoordinationOutcome[] {
  return (globalCoordination.__nexusGridCoordination ??= []);
}

/**
 * Record a finished run, newest first.
 *
 * Re-running the same gap replaces its previous outcome rather than stacking:
 * a reading should describe what the region decided about a gap, not how many
 * times an operator pressed the button.
 */
export function recordCoordination(outcome: CoordinationOutcome): void {
  const outcomes = store();
  const sameGap = outcomes.findIndex(
    (o) => o.importer_iso3 === outcome.importer_iso3 && o.commodity === outcome.commodity
  );
  if (sameGap !== -1) outcomes.splice(sameGap, 1);

  outcomes.unshift(outcome);
  if (outcomes.length > LIMIT) outcomes.length = LIMIT;
}

/** The most recent outcomes, newest first. */
export function recentCoordination(limit = 12): CoordinationOutcome[] {
  return store().slice(0, limit);
}

/** Used by tests to start from a known state. */
export function clearCoordination(): void {
  globalCoordination.__nexusGridCoordination = [];
}

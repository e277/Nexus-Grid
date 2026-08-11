/**
 * Row shapes for the observability store.
 *
 * This platform holds no domain records — farmers, crops, shipments and the
 * rest live in the systems it coordinates, and are read through the source
 * layer. What it does keep is a trail of its own behaviour: what each agent
 * decided, and what changed state as a result.
 *
 * Timestamps are ISO-8601 with a `Z` suffix, the shape the API serializes.
 */

export interface Row {
  id: number;
}

/** A record of an autonomous agent's action and its confidence. */
export interface AgentActivity extends Row {
  agent_name: string;
  action: string;
  confidence: number | null;
  /** JSON-encoded context the agent acted on */
  context: string | null;
  created_at: string | null;
}

/** An immutable trail of state-changing actions in the system. */
export interface AuditLog extends Row {
  /** Actor supplied by the integrating system, or "system". */
  actor: string;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  detail: string | null;
  created_at: string | null;
}

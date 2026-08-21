/** Recording and querying agent activity and the audit trail. */

import type { AgentActivity, AuditLog } from "./models";
import { agentActivities, auditLogs } from "./repositories";
import { utcnowIso } from "../time";

/** Persist one agent decision, serializing its context as JSON. */
export function recordAgentActivity(params: {
  agentName: string;
  action: string;
  confidence?: number | null;
  context?: Record<string, unknown> | null;
}): AgentActivity {
  return agentActivities.create({
    agent_name: params.agentName,
    action: params.action,
    confidence: params.confidence ?? null,
    context: params.context ? JSON.stringify(params.context) : null,
    created_at: utcnowIso(),
  });
}

export function listAgentActivities(options: {
  skip?: number;
  limit?: number;
  agent_name?: string | null;
}): AgentActivity[] {
  return agentActivities.list(options);
}

/**
 * Recover the `{ payload, outputs }` an agent ran with and returned, from the
 * JSON string `recordAgentActivity` wrote it as.
 *
 * Never throws: a row this can't parse is dropped to `null` rather than
 * failing the request it's attached to — this is context for a client-side
 * status readout, not a value anything server-side depends on.
 */
export function parseActivityContext(
  context: string | null
): { payload: Record<string, unknown>; outputs: Record<string, unknown> } | null {
  if (!context) return null;
  try {
    return JSON.parse(context);
  } catch {
    return null;
  }
}

export function recordAudit(params: {
  actor: string;
  action: string;
  entityType?: string | null;
  entityId?: number | null;
  detail?: string | null;
}): AuditLog {
  return auditLogs.create({
    actor: params.actor,
    action: params.action,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    detail: params.detail ?? null,
    created_at: utcnowIso(),
  });
}

export function listAuditLogs(options: {
  skip?: number;
  limit?: number;
  actor?: string | null;
  entity_type?: string | null;
}): AuditLog[] {
  return auditLogs.list(options);
}

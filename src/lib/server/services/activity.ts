/** Recording and querying agent activity and the audit trail. */

import type { AgentActivity, AuditLog } from "../models";
import { agentActivities, auditLogs } from "../repositories";
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

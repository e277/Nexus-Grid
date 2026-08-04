"""Recording and querying agent activity and the audit trail."""

import json
from typing import Any

from sqlalchemy.orm import Session

from app import models, schemas
from app.repositories import agent_activities as activity_repo
from app.repositories import audit_logs as audit_repo


def record_agent_activity(
    db: Session,
    agent_name: str,
    action: str,
    confidence: float | None = None,
    context: dict[str, Any] | None = None,
) -> models.AgentActivity:
    """Persist one agent decision, serializing its context as JSON."""
    activity = schemas.AgentActivityCreate(
        agent_name=agent_name,
        action=action,
        confidence=confidence,
        context=json.dumps(context, default=str) if context else None,
    )
    return activity_repo.create_agent_activity(db, activity)


def list_agent_activities(
    db: Session, skip: int = 0, limit: int = 100, agent_name: str | None = None
) -> list[models.AgentActivity]:
    return activity_repo.get_agent_activities(db, skip=skip, limit=limit, agent_name=agent_name)


def record_audit(
    db: Session,
    actor: str,
    action: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    detail: str | None = None,
) -> models.AuditLog:
    log = schemas.AuditLogCreate(
        actor=actor,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        detail=detail,
    )
    return audit_repo.create_audit_log(db, log)


def list_audit_logs(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    actor: str | None = None,
    entity_type: str | None = None,
) -> list[models.AuditLog]:
    return audit_repo.get_audit_logs(
        db, skip=skip, limit=limit, actor=actor, entity_type=entity_type
    )

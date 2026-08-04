"""Read-only routers for agent activity and the audit trail.

Records are created internally by agents and services, not via the API.
"""

from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.services import activity_service

agent_activities_router = APIRouter()
audit_logs_router = APIRouter()


@agent_activities_router.get("/", response_model=list[schemas.AgentActivity])
def list_agent_activities(
    skip: int = 0,
    limit: int = 100,
    agent_name: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return activity_service.list_agent_activities(
        db, skip=skip, limit=limit, agent_name=agent_name
    )


@audit_logs_router.get("/", response_model=list[schemas.AuditLog])
def list_audit_logs(
    skip: int = 0,
    limit: int = 100,
    actor: Optional[str] = None,
    entity_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return activity_service.list_audit_logs(
        db, skip=skip, limit=limit, actor=actor, entity_type=entity_type
    )

from sqlalchemy.orm import Session

from app import models, schemas
from app.repositories.base import SQLAlchemyRepository

_repo = SQLAlchemyRepository(models.AuditLog)


def get_audit_log(db: Session, log_id: int):
    return _repo.get(db, log_id)


def get_audit_logs(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    actor: str | None = None,
    entity_type: str | None = None,
):
    return _repo.list(db, skip=skip, limit=limit, actor=actor, entity_type=entity_type)


def create_audit_log(db: Session, log: schemas.AuditLogCreate):
    return _repo.create(db, log)

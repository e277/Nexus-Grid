from sqlalchemy.orm import Session

from app import models, schemas
from app.repositories.base import SQLAlchemyRepository

_repo = SQLAlchemyRepository(models.AgentActivity)


def get_agent_activity(db: Session, activity_id: int):
    return _repo.get(db, activity_id)


def get_agent_activities(
    db: Session, skip: int = 0, limit: int = 100, agent_name: str | None = None
):
    return _repo.list(db, skip=skip, limit=limit, agent_name=agent_name)


def create_agent_activity(db: Session, activity: schemas.AgentActivityCreate):
    return _repo.create(db, activity)

from sqlalchemy.orm import Session

from app import models, schemas
from app.repositories.base import SQLAlchemyRepository

_repo = SQLAlchemyRepository(models.WeatherEvent)


def get_weather_event(db: Session, event_id: int):
    return _repo.get(db, event_id)


def get_weather_events(db: Session, skip: int = 0, limit: int = 100, severity: str | None = None):
    return _repo.list(db, skip=skip, limit=limit, severity=severity)


def create_weather_event(db: Session, event: schemas.WeatherEventCreate):
    return _repo.create(
        db,
        {
            **event.model_dump(),
            "event_type": event.event_type.value,
            "severity": event.severity.value,
        },
    )

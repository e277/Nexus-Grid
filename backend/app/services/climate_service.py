"""Business logic for climate hazards.

Creating a weather event publishes ``weather.alert`` so the climate risk
agent can evaluate disruptions.
"""

from sqlalchemy.orm import Session

from app import models, schemas
from app.events import event_bus
from app.repositories import weather_events as weather_repo


def list_weather_events(
    db: Session, skip: int = 0, limit: int = 100, severity: str | None = None
) -> list[models.WeatherEvent]:
    return weather_repo.get_weather_events(db, skip=skip, limit=limit, severity=severity)


def get_weather_event(db: Session, event_id: int) -> models.WeatherEvent | None:
    return weather_repo.get_weather_event(db, event_id)


def create_weather_event(db: Session, event: schemas.WeatherEventCreate) -> models.WeatherEvent:
    db_event = weather_repo.create_weather_event(db, event)
    event_bus.publish(
        "weather.alert",
        {
            "weather_event_id": db_event.id,
            "event_type": db_event.event_type,
            "severity": db_event.severity,
            "affected_islands": db_event.affected_islands,
        },
    )
    return db_event

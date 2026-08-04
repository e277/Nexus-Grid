from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.core.security import require_role
from app.database import get_db
from app.services import climate_service

router = APIRouter()


@router.get("/", response_model=list[schemas.WeatherEvent])
def list_weather_events(
    skip: int = 0,
    limit: int = 100,
    severity: Optional[schemas.WeatherSeverity] = None,
    db: Session = Depends(get_db),
):
    return climate_service.list_weather_events(
        db, skip=skip, limit=limit, severity=severity.value if severity else None
    )


@router.post(
    "/",
    response_model=schemas.WeatherEvent,
    status_code=201,
    dependencies=[Depends(require_role("government"))],
)
def create_weather_event(event: schemas.WeatherEventCreate, db: Session = Depends(get_db)):
    return climate_service.create_weather_event(db, event)


@router.get("/{event_id}", response_model=schemas.WeatherEvent)
def get_weather_event(event_id: int, db: Session = Depends(get_db)):
    db_event = climate_service.get_weather_event(db, event_id)
    if not db_event:
        raise HTTPException(status_code=404, detail="Weather event not found")
    return db_event

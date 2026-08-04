from sqlalchemy.orm import Session

from app import models, schemas
from app.repositories.base import SQLAlchemyRepository

_repo = SQLAlchemyRepository(models.Carrier)


def get_carrier(db: Session, carrier_id: int):
    return _repo.get(db, carrier_id)


def get_carriers(db: Session, skip: int = 0, limit: int = 100, active: bool | None = None):
    return _repo.list(db, skip=skip, limit=limit, active=active)


def create_carrier(db: Session, carrier: schemas.CarrierCreate):
    return _repo.create(db, {**carrier.model_dump(), "mode": carrier.mode.value})

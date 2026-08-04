from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app import models, schemas
from app.repositories.base import SQLAlchemyRepository

_repo = SQLAlchemyRepository(models.Shipment)


def get_shipment(db: Session, shipment_id: int):
    return _repo.get(db, shipment_id)


def get_shipments(db: Session, skip: int = 0, limit: int = 100, status: str | None = None):
    return _repo.list(db, skip=skip, limit=limit, status=status)


def create_shipment(db: Session, shipment: schemas.ShipmentCreate):
    return _repo.create(db, shipment)


def update_shipment_status(db: Session, shipment: models.Shipment, status: str):
    now = datetime.now(timezone.utc)
    shipment.status = status
    if status == "in_transit" and shipment.departed_at is None:
        shipment.departed_at = now
    elif status == "delivered":
        shipment.delivered_at = now
    db.commit()
    db.refresh(shipment)
    return shipment

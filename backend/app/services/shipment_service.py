"""Business logic for shipments.

Status transitions publish the corresponding lifecycle events
(``shipment.departed``, ``shipment.delayed``, ``shipment.arrived``) so
monitoring and recovery agents can react.
"""

import logging

from sqlalchemy.orm import Session

from app import models, schemas
from app.events import event_bus
from app.repositories import crops as crop_repo
from app.repositories import demands as demand_repo
from app.repositories import shipments as shipment_repo

logger = logging.getLogger(__name__)

# Event name published for each status transition
_STATUS_EVENTS = {
    schemas.ShipmentStatus.in_transit: "shipment.departed",
    schemas.ShipmentStatus.delayed: "shipment.delayed",
    schemas.ShipmentStatus.delivered: "shipment.arrived",
}

# Allowed transitions from each status
_ALLOWED_TRANSITIONS: dict[str, set[schemas.ShipmentStatus]] = {
    "planned": {schemas.ShipmentStatus.in_transit, schemas.ShipmentStatus.cancelled},
    "in_transit": {
        schemas.ShipmentStatus.delayed,
        schemas.ShipmentStatus.delivered,
        schemas.ShipmentStatus.cancelled,
    },
    "delayed": {
        schemas.ShipmentStatus.in_transit,
        schemas.ShipmentStatus.delivered,
        schemas.ShipmentStatus.cancelled,
    },
    "delivered": set(),
    "cancelled": set(),
}


class CropNotFoundError(Exception):
    """Raised when a shipment references a crop that does not exist."""


class DemandNotFoundError(Exception):
    """Raised when a shipment references a demand that does not exist."""


class InvalidStatusTransitionError(Exception):
    """Raised when a shipment status change is not allowed."""


def list_shipments(
    db: Session, skip: int = 0, limit: int = 100, status: str | None = None
) -> list[models.Shipment]:
    return shipment_repo.get_shipments(db, skip=skip, limit=limit, status=status)


def get_shipment(db: Session, shipment_id: int) -> models.Shipment | None:
    return shipment_repo.get_shipment(db, shipment_id=shipment_id)


def create_shipment(db: Session, shipment: schemas.ShipmentCreate) -> models.Shipment:
    if crop_repo.get_crop(db, crop_id=shipment.crop_id) is None:
        raise CropNotFoundError(f"Crop {shipment.crop_id} does not exist")
    if shipment.demand_id is not None:
        if demand_repo.get_demand(db, demand_id=shipment.demand_id) is None:
            raise DemandNotFoundError(f"Demand {shipment.demand_id} does not exist")
    return shipment_repo.create_shipment(db, shipment=shipment)


def update_status(
    db: Session, shipment: models.Shipment, new_status: schemas.ShipmentStatus
) -> models.Shipment:
    allowed = _ALLOWED_TRANSITIONS.get(shipment.status, set())
    if new_status not in allowed:
        raise InvalidStatusTransitionError(
            f"Cannot move shipment {shipment.id} from {shipment.status} to {new_status.value}"
        )

    updated = shipment_repo.update_shipment_status(db, shipment, new_status.value)

    event_name = _STATUS_EVENTS.get(new_status)
    if event_name:
        event_bus.publish(
            event_name,
            {
                "shipment_id": updated.id,
                "crop_id": updated.crop_id,
                "origin_island": updated.origin_island,
                "destination_island": updated.destination_island,
                "status": updated.status,
            },
        )
    return updated

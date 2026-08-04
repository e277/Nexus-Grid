"""Business logic for demand signals.

Creating a demand publishes ``buyer.request.created`` so intelligence
agents can react to new purchasing intent.
"""

import logging

from sqlalchemy.orm import Session

from app import models, schemas
from app.events import event_bus
from app.repositories import buyers as buyer_repo
from app.repositories import demands as demand_repo

logger = logging.getLogger(__name__)


class BuyerNotFoundError(Exception):
    """Raised when a demand references a buyer that does not exist."""


class InvalidDemandTransitionError(Exception):
    """Raised when a demand status change is not allowed."""


_ALLOWED_TRANSITIONS: dict[str, set[schemas.DemandStatus]] = {
    "open": {schemas.DemandStatus.matched, schemas.DemandStatus.cancelled},
    "matched": {schemas.DemandStatus.fulfilled, schemas.DemandStatus.cancelled},
    "fulfilled": set(),
    "cancelled": set(),
}


def list_demands(
    db: Session, skip: int = 0, limit: int = 100, status: str | None = None
) -> list[models.Demand]:
    return demand_repo.get_demands(db, skip=skip, limit=limit, status=status)


def get_demand(db: Session, demand_id: int) -> models.Demand | None:
    return demand_repo.get_demand(db, demand_id=demand_id)


def create_demand(db: Session, demand: schemas.DemandCreate) -> models.Demand:
    if buyer_repo.get_buyer(db, buyer_id=demand.buyer_id) is None:
        raise BuyerNotFoundError(f"Buyer {demand.buyer_id} does not exist")

    db_demand = demand_repo.create_demand(db, demand=demand)
    event_bus.publish(
        "buyer.request.created",
        {
            "demand_id": db_demand.id,
            "buyer_id": db_demand.buyer_id,
            "crop_name": db_demand.crop_name,
            "quantity": db_demand.quantity,
        },
    )
    return db_demand


def update_status(
    db: Session, demand: models.Demand, new_status: schemas.DemandStatus
) -> models.Demand:
    allowed = _ALLOWED_TRANSITIONS.get(demand.status, set())
    if new_status not in allowed:
        raise InvalidDemandTransitionError(
            f"Cannot move demand {demand.id} from {demand.status} to {new_status.value}"
        )
    return demand_repo.update_demand_status(db, demand, new_status.value)

"""Business logic for farmer management.

Sits between the API layer and the repository so that validation and
domain rules live in one place, independent of HTTP concerns.
"""

from sqlalchemy.orm import Session

from app import models, schemas
from app.repositories import farmers as farmer_repo


def list_farmers(db: Session, skip: int = 0, limit: int = 100) -> list[models.Farmer]:
    return farmer_repo.get_farmers(db, skip=skip, limit=limit)


def get_farmer(db: Session, farmer_id: int) -> models.Farmer | None:
    return farmer_repo.get_farmer(db, farmer_id=farmer_id)


def create_farmer(db: Session, farmer: schemas.FarmerCreate) -> models.Farmer:
    return farmer_repo.create_farmer(db, farmer=farmer)

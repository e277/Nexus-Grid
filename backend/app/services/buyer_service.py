"""Business logic for buyer management."""

from sqlalchemy.orm import Session

from app import models, schemas
from app.repositories import buyers as buyer_repo


def list_buyers(db: Session, skip: int = 0, limit: int = 100) -> list[models.Buyer]:
    return buyer_repo.get_buyers(db, skip=skip, limit=limit)


def get_buyer(db: Session, buyer_id: int) -> models.Buyer | None:
    return buyer_repo.get_buyer(db, buyer_id=buyer_id)


def create_buyer(db: Session, buyer: schemas.BuyerCreate) -> models.Buyer:
    return buyer_repo.create_buyer(db, buyer=buyer)

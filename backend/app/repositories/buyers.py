from sqlalchemy.orm import Session

from app import models, schemas
from app.repositories.base import SQLAlchemyRepository

_repo = SQLAlchemyRepository(models.Buyer)


def get_buyer(db: Session, buyer_id: int):
    return _repo.get(db, buyer_id)


def get_buyers(db: Session, skip: int = 0, limit: int = 100):
    return _repo.list(db, skip=skip, limit=limit)


def create_buyer(db: Session, buyer: schemas.BuyerCreate):
    return _repo.create(db, {**buyer.model_dump(), "buyer_type": buyer.buyer_type.value})

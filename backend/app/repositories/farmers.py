from sqlalchemy.orm import Session

from app import models, schemas
from app.repositories.base import SQLAlchemyRepository

_repo = SQLAlchemyRepository(models.Farmer)


def get_farmer(db: Session, farmer_id: int):
    return _repo.get(db, farmer_id)


def get_farmers(db: Session, skip: int = 0, limit: int = 100):
    return _repo.list(db, skip=skip, limit=limit)


def create_farmer(db: Session, farmer: schemas.FarmerCreate):
    return _repo.create(db, farmer)

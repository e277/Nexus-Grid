from sqlalchemy.orm import Session

from app import models, schemas
from app.repositories.base import SQLAlchemyRepository

_repo = SQLAlchemyRepository(models.Crop)


def get_crop(db: Session, crop_id: int):
    return _repo.get(db, crop_id)


def get_crops(db: Session, skip: int = 0, limit: int = 100):
    return _repo.list(db, skip=skip, limit=limit)


def create_crop(db: Session, crop: schemas.CropCreate):
    return _repo.create(db, crop)

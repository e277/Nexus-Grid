"""Business logic for crop inventory management."""

from sqlalchemy.orm import Session

from app import models, schemas
from app.repositories import crops as crop_repo
from app.repositories import farmers as farmer_repo


class FarmerNotFoundError(Exception):
    """Raised when a crop references a farmer that does not exist."""


def list_crops(db: Session, skip: int = 0, limit: int = 100) -> list[models.Crop]:
    return crop_repo.get_crops(db, skip=skip, limit=limit)


def get_crop(db: Session, crop_id: int) -> models.Crop | None:
    return crop_repo.get_crop(db, crop_id=crop_id)


def create_crop(db: Session, crop: schemas.CropCreate) -> models.Crop:
    if farmer_repo.get_farmer(db, farmer_id=crop.farmer_id) is None:
        raise FarmerNotFoundError(f"Farmer {crop.farmer_id} does not exist")
    return crop_repo.create_crop(db, crop=crop)

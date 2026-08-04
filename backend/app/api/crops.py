from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.core.security import require_role
from app.database import get_db
from app.services import crop_service
from app.services.crop_service import FarmerNotFoundError

router = APIRouter()


@router.get("/", response_model=list[schemas.Crop])
def list_crops(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crop_service.list_crops(db, skip=skip, limit=limit)


@router.post(
    "/",
    response_model=schemas.Crop,
    status_code=201,
    dependencies=[Depends(require_role("farmer", "government"))],
)
def create_crop(crop: schemas.CropCreate, db: Session = Depends(get_db)):
    try:
        return crop_service.create_crop(db, crop=crop)
    except FarmerNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/{crop_id}", response_model=schemas.Crop)
def get_crop(crop_id: int, db: Session = Depends(get_db)):
    db_crop = crop_service.get_crop(db, crop_id=crop_id)
    if not db_crop:
        raise HTTPException(status_code=404, detail="Crop not found")
    return db_crop

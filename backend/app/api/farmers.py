from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.core.security import require_role
from app.database import get_db
from app.services import farmer_service

router = APIRouter()


@router.get("/", response_model=list[schemas.Farmer])
def list_farmers(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return farmer_service.list_farmers(db, skip=skip, limit=limit)


@router.post(
    "/",
    response_model=schemas.Farmer,
    status_code=201,
    dependencies=[Depends(require_role("farmer", "government"))],
)
def create_farmer(farmer: schemas.FarmerCreate, db: Session = Depends(get_db)):
    return farmer_service.create_farmer(db, farmer=farmer)


@router.get("/{farmer_id}", response_model=schemas.Farmer)
def get_farmer(farmer_id: int, db: Session = Depends(get_db)):
    db_farmer = farmer_service.get_farmer(db, farmer_id=farmer_id)
    if not db_farmer:
        raise HTTPException(status_code=404, detail="Farmer not found")
    return db_farmer

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.core.security import require_role
from app.database import get_db
from app.services import buyer_service

router = APIRouter()


@router.get("/", response_model=list[schemas.Buyer])
def list_buyers(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return buyer_service.list_buyers(db, skip=skip, limit=limit)


@router.post(
    "/",
    response_model=schemas.Buyer,
    status_code=201,
    dependencies=[Depends(require_role("buyer", "government"))],
)
def create_buyer(buyer: schemas.BuyerCreate, db: Session = Depends(get_db)):
    return buyer_service.create_buyer(db, buyer=buyer)


@router.get("/{buyer_id}", response_model=schemas.Buyer)
def get_buyer(buyer_id: int, db: Session = Depends(get_db)):
    db_buyer = buyer_service.get_buyer(db, buyer_id=buyer_id)
    if not db_buyer:
        raise HTTPException(status_code=404, detail="Buyer not found")
    return db_buyer

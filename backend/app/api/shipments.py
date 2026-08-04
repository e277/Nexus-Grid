from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.core.security import require_role
from app.database import get_db
from app.services import shipment_service
from app.services.shipment_service import (
    CropNotFoundError,
    DemandNotFoundError,
    InvalidStatusTransitionError,
)

router = APIRouter()


@router.get("/", response_model=list[schemas.Shipment])
def list_shipments(
    skip: int = 0,
    limit: int = 100,
    status: Optional[schemas.ShipmentStatus] = None,
    db: Session = Depends(get_db),
):
    return shipment_service.list_shipments(
        db, skip=skip, limit=limit, status=status.value if status else None
    )


@router.post(
    "/",
    response_model=schemas.Shipment,
    status_code=201,
    dependencies=[Depends(require_role("logistics"))],
)
def create_shipment(shipment: schemas.ShipmentCreate, db: Session = Depends(get_db)):
    try:
        return shipment_service.create_shipment(db, shipment=shipment)
    except (CropNotFoundError, DemandNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/{shipment_id}", response_model=schemas.Shipment)
def get_shipment(shipment_id: int, db: Session = Depends(get_db)):
    db_shipment = shipment_service.get_shipment(db, shipment_id=shipment_id)
    if not db_shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return db_shipment


@router.patch(
    "/{shipment_id}/status",
    response_model=schemas.Shipment,
    dependencies=[Depends(require_role("logistics"))],
)
def update_shipment_status(
    shipment_id: int,
    update: schemas.ShipmentStatusUpdate,
    db: Session = Depends(get_db),
):
    db_shipment = shipment_service.get_shipment(db, shipment_id=shipment_id)
    if not db_shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    try:
        return shipment_service.update_status(db, db_shipment, update.status)
    except InvalidStatusTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

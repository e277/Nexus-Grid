from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.core.security import require_role
from app.database import get_db
from app.services import demand_service
from app.services.demand_service import BuyerNotFoundError, InvalidDemandTransitionError

router = APIRouter()


@router.get("/", response_model=list[schemas.Demand])
def list_demands(
    skip: int = 0,
    limit: int = 100,
    status: Optional[schemas.DemandStatus] = None,
    db: Session = Depends(get_db),
):
    return demand_service.list_demands(
        db, skip=skip, limit=limit, status=status.value if status else None
    )


@router.post(
    "/",
    response_model=schemas.Demand,
    status_code=201,
    dependencies=[Depends(require_role("buyer", "government"))],
)
def create_demand(demand: schemas.DemandCreate, db: Session = Depends(get_db)):
    try:
        return demand_service.create_demand(db, demand=demand)
    except BuyerNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/{demand_id}", response_model=schemas.Demand)
def get_demand(demand_id: int, db: Session = Depends(get_db)):
    db_demand = demand_service.get_demand(db, demand_id=demand_id)
    if not db_demand:
        raise HTTPException(status_code=404, detail="Demand not found")
    return db_demand


@router.patch(
    "/{demand_id}/status",
    response_model=schemas.Demand,
    dependencies=[Depends(require_role("buyer", "government"))],
)
def update_demand_status(
    demand_id: int,
    update: schemas.DemandStatusUpdate,
    db: Session = Depends(get_db),
):
    db_demand = demand_service.get_demand(db, demand_id=demand_id)
    if not db_demand:
        raise HTTPException(status_code=404, detail="Demand not found")
    try:
        return demand_service.update_status(db, db_demand, update.status)
    except InvalidDemandTransitionError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

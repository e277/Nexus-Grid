from sqlalchemy.orm import Session

from app import models, schemas
from app.repositories.base import SQLAlchemyRepository

_repo = SQLAlchemyRepository(models.Demand)


def get_demand(db: Session, demand_id: int):
    return _repo.get(db, demand_id)


def get_demands(db: Session, skip: int = 0, limit: int = 100, status: str | None = None):
    return _repo.list(db, skip=skip, limit=limit, status=status)


def create_demand(db: Session, demand: schemas.DemandCreate):
    return _repo.create(db, demand)


def update_demand_status(db: Session, demand: models.Demand, status: str):
    demand.status = status
    db.commit()
    db.refresh(demand)
    return demand

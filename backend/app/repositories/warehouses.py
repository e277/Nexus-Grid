from sqlalchemy.orm import Session

from app import models, schemas
from app.repositories.base import SQLAlchemyRepository

_repo = SQLAlchemyRepository(models.Warehouse)


def get_warehouse(db: Session, warehouse_id: int):
    return _repo.get(db, warehouse_id)


def get_warehouses(db: Session, skip: int = 0, limit: int = 100, island: str | None = None):
    return _repo.list(db, skip=skip, limit=limit, island=island)


def create_warehouse(db: Session, warehouse: schemas.WarehouseCreate):
    return _repo.create(db, warehouse)

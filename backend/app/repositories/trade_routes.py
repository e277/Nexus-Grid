from sqlalchemy.orm import Session

from app import models, schemas
from app.repositories.base import SQLAlchemyRepository

_repo = SQLAlchemyRepository(models.TradeRoute)


def get_trade_route(db: Session, route_id: int):
    return _repo.get(db, route_id)


def get_trade_routes(db: Session, skip: int = 0, limit: int = 100, active: bool | None = None):
    return _repo.list(db, skip=skip, limit=limit, active=active)


def create_trade_route(db: Session, route: schemas.TradeRouteCreate):
    return _repo.create(db, {**route.model_dump(), "mode": route.mode.value})

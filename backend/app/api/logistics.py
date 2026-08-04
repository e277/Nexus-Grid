"""Routers for logistics resources: carriers, warehouses, ports, trade routes."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import schemas
from app.core.security import require_role
from app.database import get_db
from app.services import logistics_service
from app.services.logistics_service import PortNotFoundError

carriers_router = APIRouter()
warehouses_router = APIRouter()
ports_router = APIRouter()
trade_routes_router = APIRouter()

_LOGISTICS_WRITE = [Depends(require_role("logistics", "government"))]


@carriers_router.get("/", response_model=list[schemas.Carrier])
def list_carriers(
    skip: int = 0,
    limit: int = 100,
    active: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    return logistics_service.list_carriers(db, skip=skip, limit=limit, active=active)


@carriers_router.post(
    "/", response_model=schemas.Carrier, status_code=201, dependencies=_LOGISTICS_WRITE
)
def create_carrier(carrier: schemas.CarrierCreate, db: Session = Depends(get_db)):
    return logistics_service.create_carrier(db, carrier)


@carriers_router.get("/{carrier_id}", response_model=schemas.Carrier)
def get_carrier(carrier_id: int, db: Session = Depends(get_db)):
    db_carrier = logistics_service.get_carrier(db, carrier_id)
    if not db_carrier:
        raise HTTPException(status_code=404, detail="Carrier not found")
    return db_carrier


@warehouses_router.get("/", response_model=list[schemas.Warehouse])
def list_warehouses(
    skip: int = 0,
    limit: int = 100,
    island: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return logistics_service.list_warehouses(db, skip=skip, limit=limit, island=island)


@warehouses_router.post(
    "/", response_model=schemas.Warehouse, status_code=201, dependencies=_LOGISTICS_WRITE
)
def create_warehouse(warehouse: schemas.WarehouseCreate, db: Session = Depends(get_db)):
    return logistics_service.create_warehouse(db, warehouse)


@warehouses_router.get("/{warehouse_id}", response_model=schemas.Warehouse)
def get_warehouse(warehouse_id: int, db: Session = Depends(get_db)):
    db_warehouse = logistics_service.get_warehouse(db, warehouse_id)
    if not db_warehouse:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return db_warehouse


@ports_router.get("/", response_model=list[schemas.Port])
def list_ports(
    skip: int = 0,
    limit: int = 100,
    status: Optional[schemas.PortStatus] = None,
    db: Session = Depends(get_db),
):
    return logistics_service.list_ports(
        db, skip=skip, limit=limit, status=status.value if status else None
    )


@ports_router.post(
    "/", response_model=schemas.Port, status_code=201, dependencies=_LOGISTICS_WRITE
)
def create_port(port: schemas.PortCreate, db: Session = Depends(get_db)):
    return logistics_service.create_port(db, port)


@ports_router.get("/{port_id}", response_model=schemas.Port)
def get_port(port_id: int, db: Session = Depends(get_db)):
    db_port = logistics_service.get_port(db, port_id)
    if not db_port:
        raise HTTPException(status_code=404, detail="Port not found")
    return db_port


@ports_router.patch(
    "/{port_id}/status", response_model=schemas.Port, dependencies=_LOGISTICS_WRITE
)
def update_port_status(
    port_id: int, update: schemas.PortStatusUpdate, db: Session = Depends(get_db)
):
    db_port = logistics_service.get_port(db, port_id)
    if not db_port:
        raise HTTPException(status_code=404, detail="Port not found")
    return logistics_service.update_port_status(db, db_port, update.status)


@trade_routes_router.get("/", response_model=list[schemas.TradeRoute])
def list_trade_routes(
    skip: int = 0,
    limit: int = 100,
    active: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    return logistics_service.list_trade_routes(db, skip=skip, limit=limit, active=active)


@trade_routes_router.post(
    "/", response_model=schemas.TradeRoute, status_code=201, dependencies=_LOGISTICS_WRITE
)
def create_trade_route(route: schemas.TradeRouteCreate, db: Session = Depends(get_db)):
    try:
        return logistics_service.create_trade_route(db, route)
    except PortNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@trade_routes_router.get("/{route_id}", response_model=schemas.TradeRoute)
def get_trade_route(route_id: int, db: Session = Depends(get_db)):
    db_route = logistics_service.get_trade_route(db, route_id)
    if not db_route:
        raise HTTPException(status_code=404, detail="Trade route not found")
    return db_route

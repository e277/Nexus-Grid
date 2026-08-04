"""Business logic for logistics resources: carriers, warehouses, ports, routes."""

from sqlalchemy.orm import Session

from app import models, schemas
from app.repositories import carriers as carrier_repo
from app.repositories import ports as port_repo
from app.repositories import trade_routes as route_repo
from app.repositories import warehouses as warehouse_repo


class PortNotFoundError(Exception):
    """Raised when a trade route references a port that does not exist."""


# Carriers
def list_carriers(db: Session, skip: int = 0, limit: int = 100, active: bool | None = None):
    return carrier_repo.get_carriers(db, skip=skip, limit=limit, active=active)


def get_carrier(db: Session, carrier_id: int):
    return carrier_repo.get_carrier(db, carrier_id)


def create_carrier(db: Session, carrier: schemas.CarrierCreate):
    return carrier_repo.create_carrier(db, carrier)


# Warehouses
def list_warehouses(db: Session, skip: int = 0, limit: int = 100, island: str | None = None):
    return warehouse_repo.get_warehouses(db, skip=skip, limit=limit, island=island)


def get_warehouse(db: Session, warehouse_id: int):
    return warehouse_repo.get_warehouse(db, warehouse_id)


def create_warehouse(db: Session, warehouse: schemas.WarehouseCreate):
    return warehouse_repo.create_warehouse(db, warehouse)


# Ports
def list_ports(db: Session, skip: int = 0, limit: int = 100, status: str | None = None):
    return port_repo.get_ports(db, skip=skip, limit=limit, status=status)


def get_port(db: Session, port_id: int):
    return port_repo.get_port(db, port_id)


def create_port(db: Session, port: schemas.PortCreate):
    return port_repo.create_port(db, port)


def update_port_status(db: Session, port: models.Port, status: schemas.PortStatus):
    return port_repo.update_port_status(db, port, status.value)


# Trade routes
def list_trade_routes(db: Session, skip: int = 0, limit: int = 100, active: bool | None = None):
    return route_repo.get_trade_routes(db, skip=skip, limit=limit, active=active)


def get_trade_route(db: Session, route_id: int):
    return route_repo.get_trade_route(db, route_id)


def create_trade_route(db: Session, route: schemas.TradeRouteCreate):
    for port_id in (route.origin_port_id, route.destination_port_id):
        if port_repo.get_port(db, port_id) is None:
            raise PortNotFoundError(f"Port {port_id} does not exist")
    return route_repo.create_trade_route(db, route)

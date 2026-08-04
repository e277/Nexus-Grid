from sqlalchemy.orm import Session

from app import models, schemas
from app.repositories.base import SQLAlchemyRepository

_repo = SQLAlchemyRepository(models.Port)


def get_port(db: Session, port_id: int):
    return _repo.get(db, port_id)


def get_ports(db: Session, skip: int = 0, limit: int = 100, status: str | None = None):
    return _repo.list(db, skip=skip, limit=limit, status=status)


def create_port(db: Session, port: schemas.PortCreate):
    return _repo.create(db, {**port.model_dump(), "port_type": port.port_type.value})


def update_port_status(db: Session, port: models.Port, status: str):
    port.status = status
    db.commit()
    db.refresh(port)
    return port

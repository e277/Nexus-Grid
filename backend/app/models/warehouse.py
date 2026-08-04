from sqlalchemy import Boolean, Column, Integer, String

from app.database import Base


class Warehouse(Base):
    """A storage facility, optionally cold-chain capable."""

    __tablename__ = "warehouses"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    island = Column(String, nullable=False)
    capacity = Column(Integer)
    cold_storage = Column(Boolean, default=False)

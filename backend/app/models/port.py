from sqlalchemy import Column, Integer, String

from app.database import Base


class Port(Base):
    """A sea or air port through which shipments transit."""

    __tablename__ = "ports"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    island = Column(String, nullable=False)
    port_type = Column(String, default="sea")  # sea | air
    status = Column(String, default="open")  # open | congested | closed

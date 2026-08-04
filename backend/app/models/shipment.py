from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from app.database import Base


class Shipment(Base):
    """A planned or in-flight movement of produce between islands."""

    __tablename__ = "shipments"

    id = Column(Integer, primary_key=True)
    crop_id = Column(Integer, ForeignKey("crops.id"), nullable=False)
    demand_id = Column(Integer, ForeignKey("demands.id"))
    carrier = Column(String)
    origin_island = Column(String, nullable=False)
    destination_island = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    # planned | in_transit | delayed | delivered | cancelled
    status = Column(String, default="planned")
    departed_at = Column(DateTime(timezone=True))
    eta = Column(DateTime(timezone=True))
    delivered_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

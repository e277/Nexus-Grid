from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, func

from app.database import Base


class Demand(Base):
    """A buyer's request for a quantity of a crop by a given date."""

    __tablename__ = "demands"

    id = Column(Integer, primary_key=True)
    buyer_id = Column(Integer, ForeignKey("buyers.id"), nullable=False)
    crop_name = Column(String, nullable=False)
    quantity = Column(Integer, nullable=False)
    needed_by = Column(Date)
    status = Column(String, default="open")  # open | matched | fulfilled | cancelled
    created_at = Column(DateTime(timezone=True), server_default=func.now())

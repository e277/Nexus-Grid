from sqlalchemy import Boolean, Column, ForeignKey, Integer, String

from app.database import Base


class TradeRoute(Base):
    """A recurring origin→destination lane between two ports."""

    __tablename__ = "trade_routes"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    origin_port_id = Column(Integer, ForeignKey("ports.id"), nullable=False)
    destination_port_id = Column(Integer, ForeignKey("ports.id"), nullable=False)
    mode = Column(String, default="sea")  # sea | air
    transit_hours = Column(Integer)
    active = Column(Boolean, default=True)

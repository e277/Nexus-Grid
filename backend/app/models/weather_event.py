from sqlalchemy import Column, DateTime, Integer, String, func

from app.database import Base


class WeatherEvent(Base):
    """A climate hazard that may disrupt production or logistics."""

    __tablename__ = "weather_events"

    id = Column(Integer, primary_key=True)
    event_type = Column(String, nullable=False)  # storm | hurricane | flood | drought
    severity = Column(String, default="low")  # low | medium | high | severe
    affected_islands = Column(String)  # comma-separated island names
    starts_at = Column(DateTime(timezone=True))
    ends_at = Column(DateTime(timezone=True))
    source = Column(String)  # e.g. CIMH, NOAA
    created_at = Column(DateTime(timezone=True), server_default=func.now())

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict


class WeatherEventType(str, Enum):
    storm = "storm"
    hurricane = "hurricane"
    flood = "flood"
    drought = "drought"


class WeatherSeverity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    severe = "severe"


class WeatherEventBase(BaseModel):
    event_type: WeatherEventType
    severity: WeatherSeverity = WeatherSeverity.low
    affected_islands: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    source: Optional[str] = None


class WeatherEventCreate(WeatherEventBase):
    pass


class WeatherEvent(WeatherEventBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: Optional[datetime] = None

from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict


class TransportMode(str, Enum):
    sea = "sea"
    air = "air"
    land = "land"


class CarrierBase(BaseModel):
    name: str
    mode: TransportMode = TransportMode.sea
    capacity: Optional[int] = None
    home_island: Optional[str] = None
    contact_email: Optional[str] = None
    active: bool = True


class CarrierCreate(CarrierBase):
    pass


class Carrier(CarrierBase):
    model_config = ConfigDict(from_attributes=True)

    id: int

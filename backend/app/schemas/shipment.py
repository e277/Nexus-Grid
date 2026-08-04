from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ShipmentStatus(str, Enum):
    planned = "planned"
    in_transit = "in_transit"
    delayed = "delayed"
    delivered = "delivered"
    cancelled = "cancelled"


class ShipmentBase(BaseModel):
    crop_id: int
    demand_id: Optional[int] = None
    carrier: Optional[str] = None
    origin_island: str
    destination_island: str
    quantity: int = Field(gt=0)
    eta: Optional[datetime] = None


class ShipmentCreate(ShipmentBase):
    pass


class ShipmentStatusUpdate(BaseModel):
    status: ShipmentStatus


class Shipment(ShipmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: ShipmentStatus = ShipmentStatus.planned
    departed_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

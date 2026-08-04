from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class DemandStatus(str, Enum):
    open = "open"
    matched = "matched"
    fulfilled = "fulfilled"
    cancelled = "cancelled"


class DemandBase(BaseModel):
    buyer_id: int
    crop_name: str
    quantity: int = Field(gt=0)
    needed_by: Optional[date] = None


class DemandCreate(DemandBase):
    pass


class DemandStatusUpdate(BaseModel):
    status: DemandStatus


class Demand(DemandBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: DemandStatus = DemandStatus.open
    created_at: Optional[datetime] = None

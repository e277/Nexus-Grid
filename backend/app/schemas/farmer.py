from typing import Optional

from pydantic import BaseModel, ConfigDict


class FarmerBase(BaseModel):
    name: str
    island: Optional[str] = None
    crops: Optional[str] = None
    capacity: Optional[int] = None


class FarmerCreate(FarmerBase):
    pass


class Farmer(FarmerBase):
    model_config = ConfigDict(from_attributes=True)

    id: int

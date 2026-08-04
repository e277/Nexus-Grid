from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class CropBase(BaseModel):
    farmer_id: int
    crop_name: str
    quantity: int = Field(ge=0)
    harvest_date: Optional[date] = None


class CropCreate(CropBase):
    pass


class Crop(CropBase):
    model_config = ConfigDict(from_attributes=True)

    id: int

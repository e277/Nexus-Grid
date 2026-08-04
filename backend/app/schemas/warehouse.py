from typing import Optional

from pydantic import BaseModel, ConfigDict


class WarehouseBase(BaseModel):
    name: str
    island: str
    capacity: Optional[int] = None
    cold_storage: bool = False


class WarehouseCreate(WarehouseBase):
    pass


class Warehouse(WarehouseBase):
    model_config = ConfigDict(from_attributes=True)

    id: int

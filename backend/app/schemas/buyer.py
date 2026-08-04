from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict


class BuyerType(str, Enum):
    retailer = "retailer"
    wholesaler = "wholesaler"
    government = "government"


class BuyerBase(BaseModel):
    name: str
    island: Optional[str] = None
    buyer_type: BuyerType = BuyerType.retailer
    contact_email: Optional[str] = None


class BuyerCreate(BuyerBase):
    pass


class Buyer(BuyerBase):
    model_config = ConfigDict(from_attributes=True)

    id: int

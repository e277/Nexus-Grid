from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.port import PortType


class TradeRouteBase(BaseModel):
    name: str
    origin_port_id: int
    destination_port_id: int
    mode: PortType = PortType.sea
    transit_hours: Optional[int] = Field(default=None, gt=0)
    active: bool = True


class TradeRouteCreate(TradeRouteBase):
    pass


class TradeRoute(TradeRouteBase):
    model_config = ConfigDict(from_attributes=True)

    id: int

from enum import Enum

from pydantic import BaseModel, ConfigDict


class PortType(str, Enum):
    sea = "sea"
    air = "air"


class PortStatus(str, Enum):
    open = "open"
    congested = "congested"
    closed = "closed"


class PortBase(BaseModel):
    name: str
    island: str
    port_type: PortType = PortType.sea


class PortCreate(PortBase):
    pass


class PortStatusUpdate(BaseModel):
    status: PortStatus


class Port(PortBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: PortStatus = PortStatus.open

from pydantic import BaseModel
from typing import Literal, Optional


class WorkflowRequest(BaseModel):
    crop_id: Optional[int] = None
    crop_name: Optional[str] = None
    farmer_id: Optional[int] = None
    farmer_name: Optional[str] = None
    island: Optional[str] = None
    quantity: Optional[int] = None
    event: Optional[str] = None
    message: Optional[str] = None
    market_context: Optional[str] = None
    weather_risk: Optional[str] = None
    logistics_status: Optional[str] = None
    demand_signal: Optional[str] = None
    require_approval: Optional[bool] = None


class WorkflowResponse(BaseModel):
    status: str
    result: dict


class ResumeRequest(BaseModel):
    decision: Literal["approved", "rejected"]

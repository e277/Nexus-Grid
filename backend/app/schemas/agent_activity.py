from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class AgentActivityBase(BaseModel):
    agent_name: str
    action: str
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    context: Optional[str] = None


class AgentActivityCreate(AgentActivityBase):
    pass


class AgentActivity(AgentActivityBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: Optional[datetime] = None

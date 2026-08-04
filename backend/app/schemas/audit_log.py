from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AuditLogBase(BaseModel):
    actor: str
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    detail: Optional[str] = None


class AuditLogCreate(AuditLogBase):
    pass


class AuditLog(AuditLogBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: Optional[datetime] = None

from sqlalchemy import Column, DateTime, Integer, String, Text, func

from app.database import Base


class AuditLog(Base):
    """An immutable trail of state-changing actions in the system."""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    actor = Column(String, nullable=False)  # user id, agent name, or "system"
    action = Column(String, nullable=False)
    entity_type = Column(String)
    entity_id = Column(Integer)
    detail = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

from sqlalchemy import Column, DateTime, Float, Integer, String, Text, func

from app.database import Base


class AgentActivity(Base):
    """A record of an autonomous agent's action and its confidence."""

    __tablename__ = "agent_activities"

    id = Column(Integer, primary_key=True)
    agent_name = Column(String, nullable=False)
    action = Column(String, nullable=False)
    confidence = Column(Float)
    context = Column(Text)  # JSON-encoded context the agent acted on
    created_at = Column(DateTime(timezone=True), server_default=func.now())

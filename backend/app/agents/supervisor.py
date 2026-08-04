"""Supervisor Agent.

Routes incoming events to the specialist agent responsible for them and
returns that specialist's result. This is the single dispatch point used
by the event system (Phase 5).
"""

from typing import Any

from sqlalchemy.orm import Session

from app.agents.base import AgentResult, BaseAgent
from app.agents.climate_agent import ClimateRiskAgent
from app.agents.customs_agent import CustomsAgent
from app.agents.demand_agent import DemandIntelligenceAgent
from app.agents.logistics_agent import LogisticsAgent


class SupervisorAgent(BaseAgent):
    name = "supervisor"

    def __init__(self) -> None:
        super().__init__()
        self.demand = DemandIntelligenceAgent()
        self.logistics = LogisticsAgent()
        self.climate = ClimateRiskAgent()
        self.customs = CustomsAgent()

        # Event → specialist routing table
        self.routes: dict[str, BaseAgent] = {
            "buyer.request.created": self.demand,
            "crop.harvest.ready": self.demand,
            "weather.alert": self.climate,
            "shipment.delayed": self.logistics,
            "shipment.departed": self.customs,
            "customs.approved": self.logistics,
        }

    def handle(self, db: Session, payload: dict[str, Any]) -> AgentResult:
        event = payload.get("event", "")
        specialist = self.routes.get(event)
        if specialist is None:
            return AgentResult(
                agent=self.name,
                action="no_route",
                confidence=1.0,
                rationale=f"No specialist registered for event {event!r}",
                outputs={"event": event},
            )

        result = specialist.run(db, payload)
        return AgentResult(
            agent=self.name,
            action=f"delegated:{specialist.name}",
            confidence=result.confidence,
            rationale=f"Routed {event!r} to {specialist.name}",
            outputs=result.as_dict(),
        )

    def dispatch(self, db: Session, event: str, payload: dict[str, Any]) -> AgentResult:
        """Convenience entry point for the event bus."""
        return self.run(db, {**payload, "event": event})


supervisor = SupervisorAgent()

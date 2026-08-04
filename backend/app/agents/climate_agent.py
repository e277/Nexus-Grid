"""Climate Risk Agent.

Evaluates weather alerts, identifies shipments at risk in affected
islands, and recommends rerouting or holds.
"""

from typing import Any

from sqlalchemy.orm import Session

from app import models
from app.agents.base import AgentResult, BaseAgent

_SEVERITY_RISK = {"low": 0.2, "medium": 0.5, "high": 0.8, "severe": 0.95}


class ClimateRiskAgent(BaseAgent):
    name = "climate_risk"

    def handle(self, db: Session, payload: dict[str, Any]) -> AgentResult:
        severity = payload.get("severity", "low")
        risk = _SEVERITY_RISK.get(severity, 0.2)
        islands = [
            island.strip()
            for island in (payload.get("affected_islands") or "").split(",")
            if island.strip()
        ]

        at_risk = []
        if islands:
            shipments = (
                db.query(models.Shipment)
                .filter(models.Shipment.status.in_(["planned", "in_transit"]))
                .all()
            )
            at_risk = [
                {"shipment_id": s.id, "origin": s.origin_island, "destination": s.destination_island}
                for s in shipments
                if s.origin_island in islands or s.destination_island in islands
            ]

        if risk >= 0.8 and at_risk:
            action = "recommend_reroute"
            rationale = (
                f"{severity} {payload.get('event_type', 'event')} threatens "
                f"{len(at_risk)} active shipment(s) in {', '.join(islands)}"
            )
        elif risk >= 0.5:
            action = "monitor_disruption"
            rationale = f"{severity} event: tracking {len(at_risk)} potentially exposed shipment(s)"
        else:
            action = "no_action"
            rationale = f"{severity} event poses minimal supply chain risk"

        return AgentResult(
            agent=self.name,
            action=action,
            confidence=risk if action != "no_action" else 1 - risk,
            rationale=rationale,
            outputs={"risk": risk, "affected_islands": islands, "shipments_at_risk": at_risk},
        )

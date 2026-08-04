"""Logistics Agent.

Plans transportation for a shipment request: selects an active carrier
with sufficient capacity and prefers an active trade route between the
origin and destination islands.
"""

from typing import Any

from sqlalchemy.orm import Session

from app import models
from app.agents.base import AgentResult, BaseAgent


class LogisticsAgent(BaseAgent):
    name = "logistics"

    def _find_route(self, db: Session, origin: str | None, destination: str | None):
        if not origin or not destination:
            return None
        routes = (
            db.query(models.TradeRoute)
            .filter(models.TradeRoute.active.is_(True))
            .all()
        )
        ports = {p.id: p for p in db.query(models.Port).all()}
        for route in routes:
            origin_port = ports.get(route.origin_port_id)
            dest_port = ports.get(route.destination_port_id)
            if (
                origin_port
                and dest_port
                and origin_port.island == origin
                and dest_port.island == destination
                and origin_port.status != "closed"
                and dest_port.status != "closed"
            ):
                return route
        return None

    def handle(self, db: Session, payload: dict[str, Any]) -> AgentResult:
        quantity = payload.get("quantity") or 0
        origin = payload.get("origin_island")
        destination = payload.get("destination_island")

        carriers = (
            db.query(models.Carrier)
            .filter(models.Carrier.active.is_(True))
            .order_by(models.Carrier.capacity.desc())
            .all()
        )
        carrier = next((c for c in carriers if (c.capacity or 0) >= quantity), None)
        route = self._find_route(db, origin, destination)

        if carrier is None:
            return AgentResult(
                agent=self.name,
                action="no_capacity",
                confidence=0.7,
                rationale=f"No active carrier can move {quantity} units",
                outputs={"quantity": quantity, "carriers_considered": len(carriers)},
            )

        plan = {
            "carrier_id": carrier.id,
            "carrier": carrier.name,
            "mode": carrier.mode,
            "route_id": route.id if route else None,
            "transit_hours": route.transit_hours if route else None,
        }
        confidence = 0.9 if route else 0.6
        rationale = (
            f"Selected carrier {carrier.name!r}"
            + (f" on route {route.name!r}" if route else " (no registered route; direct booking)")
        )
        return AgentResult(
            agent=self.name,
            action="plan_transport",
            confidence=confidence,
            rationale=rationale,
            outputs=plan,
        )

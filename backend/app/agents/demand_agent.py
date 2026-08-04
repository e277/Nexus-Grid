"""Demand Intelligence Agent.

Matches open demands to available crop supply, scores the opportunities,
and flags predicted shortages when open demand exceeds supply.
"""

from typing import Any

from sqlalchemy.orm import Session

from app import models
from app.agents.base import AgentResult, BaseAgent


class DemandIntelligenceAgent(BaseAgent):
    name = "demand_intelligence"

    def handle(self, db: Session, payload: dict[str, Any]) -> AgentResult:
        crop_name = payload.get("crop_name")
        requested = payload.get("quantity") or 0

        query = db.query(models.Crop)
        if crop_name:
            query = query.filter(models.Crop.crop_name.ilike(crop_name))
        crops = query.all()
        available = sum(c.quantity or 0 for c in crops)

        matches = [
            {
                "crop_id": c.id,
                "farmer_id": c.farmer_id,
                "quantity": c.quantity,
                # Simple opportunity score: how much of the request one lot covers
                "score": round(min((c.quantity or 0) / requested, 1.0), 2) if requested else 0.0,
            }
            for c in sorted(crops, key=lambda c: c.quantity or 0, reverse=True)
            if (c.quantity or 0) > 0
        ][:5]

        if requested and available < requested:
            return AgentResult(
                agent=self.name,
                action="predict_shortage",
                confidence=0.8,
                rationale=(
                    f"Open demand for {requested} of {crop_name!r} exceeds "
                    f"available supply {available}"
                ),
                outputs={"available": available, "requested": requested, "matches": matches},
            )

        confidence = 0.9 if matches else 0.5
        return AgentResult(
            agent=self.name,
            action="match_buyers" if matches else "no_supply_found",
            confidence=confidence,
            rationale=f"Found {len(matches)} candidate lots for {crop_name!r}",
            outputs={"available": available, "requested": requested, "matches": matches},
        )

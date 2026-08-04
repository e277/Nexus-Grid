"""Supply Intelligence Agent.

Scans crop inventory, classifies surplus/shortage conditions, and
triggers the orchestration workflow for each detected event.
"""

import logging
from typing import Any

from sqlalchemy.orm import Session

from app import models
from app.agents.base import AgentResult, BaseAgent
from app.services.supply_rules import classify_quantity
from app.workflows.orchestrator import run_once

logger = logging.getLogger(__name__)


class SupplyAgent(BaseAgent):
    """Agent that inspects crops and triggers the workflow on conditions."""

    name = "supply_intelligence"

    def analyze_inventory(self, crop: models.Crop) -> dict:
        if crop.quantity is None:
            return {"status": "unknown", "message": "quantity missing"}

        status = classify_quantity(crop.quantity)
        if status == "normal":
            return {"status": status, "message": "inventory within expected range"}
        return {"status": status, "message": f"{crop.crop_name} {status} detected"}

    def handle(self, db: Session, payload: dict[str, Any]) -> AgentResult:
        events = self._scan(db)
        confidence = 0.9 if events else 0.7
        return AgentResult(
            agent=self.name,
            action="inventory_scan",
            confidence=confidence,
            rationale=f"Detected {len(events)} inventory event(s)",
            outputs={"events": events},
        )

    def _scan(self, db: Session) -> list[dict[str, Any]]:
        """Analyze all crops and trigger the workflow for each anomaly."""
        events: list[dict[str, Any]] = []
        crops = db.query(models.Crop).all()
        for crop in crops:
            try:
                result = self.analyze_inventory(crop)
                status = result.get("status")
                if status not in {"surplus", "shortage"}:
                    continue

                self.logger.info("Inventory event detected: %s", result.get("message"))
                farmer = None
                if crop.farmer_id is not None:
                    farmer = db.get(models.Farmer, crop.farmer_id)

                context = {
                    "crop_id": crop.id,
                    "crop_name": crop.crop_name,
                    "quantity": crop.quantity,
                    "farmer_id": crop.farmer_id,
                    "farmer_name": getattr(farmer, "name", None),
                    "island": getattr(farmer, "island", None),
                    "event": status,
                    "message": result.get("message"),
                    "logistics_status": (
                        "available" if (getattr(farmer, "capacity", 0) or 0) > 0 else "constrained"
                    ),
                    "harvest_date": crop.harvest_date.isoformat() if crop.harvest_date else None,
                }
                events.append({"crop_id": crop.id, "status": status})
                try:
                    run_once(context)
                except Exception:
                    self.logger.exception("Orchestrator failed for crop %s", crop.id)
            except Exception:
                self.logger.exception("Failed to analyze crop %s", getattr(crop, "id", None))
        return events

    def run_check(self, db: Session) -> int:
        """Run one scan cycle; returns the number of events detected.

        Kept as the entry point for the periodic runner loop.
        """
        result = self.run(db, {"trigger": "periodic_scan"})
        return len(result.outputs.get("events", []))

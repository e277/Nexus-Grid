"""Supply Intelligence Agent.

Scans crop inventory, classifies surplus/shortage conditions, and
triggers the orchestration workflow for each detected event.
"""

import logging
from typing import Any

from sqlalchemy.orm import Session

from app import models
from app.agents.base import AgentResult, BaseAgent
from app.services.supply_rules import SHORTAGE_THRESHOLD, SURPLUS_THRESHOLD, classify_quantity
from app.workflows.orchestrator import run_once

logger = logging.getLogger(__name__)


def _margin_confidence(quantity: int) -> float:
    """How clearly ``quantity`` sits inside its band, as a 0..1 margin.

    Distance from the nearer threshold, normalized by that threshold's
    scale — a quantity right at a boundary is ambiguous (near 0); one far
    inside a band is unambiguous (near 1). Not a probability, just a
    legible measure of how confidently the classification holds.
    """
    if quantity <= 0:
        return 0.0
    if quantity < SHORTAGE_THRESHOLD:
        return min(1.0, (SHORTAGE_THRESHOLD - quantity) / SHORTAGE_THRESHOLD)
    if quantity > SURPLUS_THRESHOLD:
        return min(1.0, (quantity - SURPLUS_THRESHOLD) / SURPLUS_THRESHOLD)
    # Inside the normal band: confidence peaks at the midpoint, tapers at either edge.
    span = SURPLUS_THRESHOLD - SHORTAGE_THRESHOLD
    midpoint = SHORTAGE_THRESHOLD + span / 2
    return 1.0 - abs(quantity - midpoint) / (span / 2)


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
        events, margins = self._scan(db)
        confidence = self._confidence(events, margins)
        return AgentResult(
            agent=self.name,
            action="inventory_scan",
            confidence=confidence,
            rationale=f"Detected {len(events)} inventory event(s)",
            outputs={"events": events},
        )

    def _confidence(self, events: list[dict[str, Any]], margins: list[float]) -> float:
        """Confidence from real scan signal, not a fixed constant.

        No crops scanned: nothing to be confident about. Otherwise it's the
        average classification margin across scanned crops (see
        ``_margin_confidence``), nudged up slightly per corroborating event
        (more anomalies agreeing on a shortage/surplus condition is itself
        signal) — bounded to 1.0.
        """
        if not margins:
            return 0.0
        base = sum(margins) / len(margins)
        return min(1.0, base + 0.05 * len(events))

    def _scan(self, db: Session) -> tuple[list[dict[str, Any]], list[float]]:
        """Analyze all crops and trigger the workflow for each anomaly.

        Returns the detected events plus the per-crop classification margin
        used to compute scan confidence.
        """
        events: list[dict[str, Any]] = []
        margins: list[float] = []
        crops = db.query(models.Crop).all()
        for crop in crops:
            try:
                result = self.analyze_inventory(crop)
                status = result.get("status")
                if status == "unknown":
                    continue
                margins.append(_margin_confidence(crop.quantity))
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
        return events, margins

    def run_check(self, db: Session) -> int:
        """Run one scan cycle; returns the number of events detected.

        Kept as the entry point for the periodic runner loop.
        """
        result = self.run(db, {"trigger": "periodic_scan"})
        return len(result.outputs.get("events", []))

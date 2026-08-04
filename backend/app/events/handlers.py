"""Event subscriptions: every domain event routes to the supervisor agent.

Registered once at application startup. Handlers open their own session
so agent work is transactionally independent of the publishing request.
"""

import logging
from typing import Any

from app.database import SessionLocal
from app.events.bus import event_bus

logger = logging.getLogger(__name__)

# Events the supervisor knows how to route (see SupervisorAgent.routes)
SUPERVISED_EVENTS = [
    "crop.harvest.ready",
    "buyer.request.created",
    "shipment.departed",
    "shipment.delayed",
    "weather.alert",
    "customs.approved",
    "shipment.arrived",
]

_registered = False


def _dispatch_to_supervisor(event_name: str, payload: dict[str, Any]) -> None:
    # Imported lazily: agents import services, which import this package
    from app.agents.supervisor import supervisor

    db = SessionLocal()
    try:
        supervisor.dispatch(db, event_name, payload)
    except Exception:
        logger.exception("Supervisor dispatch failed for %s", event_name)
    finally:
        db.close()


def register_event_handlers() -> None:
    """Subscribe the supervisor to all supervised events (idempotent)."""
    global _registered
    if _registered:
        return
    for event_name in SUPERVISED_EVENTS:
        event_bus.subscribe(event_name, _dispatch_to_supervisor)
    _registered = True
    logger.info("Registered supervisor for %d event types", len(SUPERVISED_EVENTS))

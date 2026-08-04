"""Shared supply-domain rules and signal-context defaults.

Single source of truth for the surplus/shortage thresholds and for the
default values of the signal context that flows from agents into the
workflow graph and the LLM recommendation step.
"""

from typing import Any

SURPLUS_THRESHOLD = 1000
SHORTAGE_THRESHOLD = 100

# Defaults for every field the workflow and LLM prompt consume
SIGNAL_DEFAULTS: dict[str, Any] = {
    "event": "inventory_checked",
    "quantity": 0,
    "crop_name": "unknown crop",
    "farmer_name": "unknown farmer",
    "island": "unknown island",
    "market_context": "regional demand stable",
    "weather_risk": "low",
    "logistics_status": "available",
    "demand_signal": "balanced",
}


def classify_quantity(quantity: int) -> str:
    """Classify an inventory quantity as surplus, shortage, or normal."""
    if quantity > SURPLUS_THRESHOLD:
        return "surplus"
    if quantity < SHORTAGE_THRESHOLD:
        return "shortage"
    return "normal"


def with_signal_defaults(context: dict[str, Any]) -> dict[str, Any]:
    """Return the signal fields from ``context`` with defaults filled in.

    Only keys in ``SIGNAL_DEFAULTS`` are returned; None values fall back
    to their default so downstream consumers never see missing fields.
    """
    return {
        key: context.get(key) if context.get(key) is not None else default
        for key, default in SIGNAL_DEFAULTS.items()
    }

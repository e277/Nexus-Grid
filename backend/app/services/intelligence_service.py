"""Predictive intelligence with explainable outputs (Phase 8).

Each prediction returns the number, the inputs that produced it, and a
plain-language explanation, so operators can always see *why*.
The models are transparent heuristics today; they can be replaced by
trained models behind the same signatures.
"""

from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from app import models
from app.integrations import get_pricing_provider, get_routing_provider, get_weather_provider

# Approximate post-harvest shelf life in days for common crops
_SHELF_LIFE_DAYS = {
    "banana": 14,
    "mango": 10,
    "tomato": 7,
    "yam": 60,
    "pepper": 12,
}
_DEFAULT_SHELF_LIFE = 14

_TREND_FACTOR = {"rising": 1.2, "stable": 1.0, "falling": 0.85}
_RISK_DELAY_HOURS = {"low": 0, "medium": 12, "high": 36}


def supply_chain_overview(db: Session) -> dict[str, Any]:
    """One-call dashboard aggregate: counts, food-security gaps, disruptions."""
    farmers = db.query(models.Farmer).count()
    buyers = db.query(models.Buyer).count()
    crops = db.query(models.Crop).all()
    demands = db.query(models.Demand).all()
    shipments = db.query(models.Shipment).all()

    shipments_by_status: dict[str, int] = {}
    for s in shipments:
        shipments_by_status[s.status] = shipments_by_status.get(s.status, 0) + 1

    # Regional food security: open demand vs available supply per crop
    supply: dict[str, int] = {}
    for c in crops:
        key = (c.crop_name or "").lower()
        supply[key] = supply.get(key, 0) + (c.quantity or 0)
    open_demand: dict[str, int] = {}
    for d in demands:
        if d.status == "open":
            key = (d.crop_name or "").lower()
            open_demand[key] = open_demand.get(key, 0) + (d.quantity or 0)
    gaps = [
        {
            "crop_name": crop,
            "open_demand": requested,
            "available_supply": supply.get(crop, 0),
            "gap": requested - supply.get(crop, 0),
        }
        for crop, requested in open_demand.items()
        if requested > supply.get(crop, 0)
    ]
    gaps.sort(key=lambda g: g["gap"], reverse=True)

    active_hazards = (
        db.query(models.WeatherEvent)
        .filter(models.WeatherEvent.severity.in_(["high", "severe"]))
        .count()
    )
    ports_disrupted = (
        db.query(models.Port).filter(models.Port.status != "open").count()
    )
    agent_activities = db.query(models.AgentActivity).count()

    health = "healthy"
    if gaps or ports_disrupted:
        health = "strained"
    if active_hazards and (gaps or ports_disrupted):
        health = "at_risk"

    return {
        "health": health,
        "counts": {
            "farmers": farmers,
            "buyers": buyers,
            "crop_lots": len(crops),
            "total_inventory": sum(c.quantity or 0 for c in crops),
            "open_demands": sum(1 for d in demands if d.status == "open"),
            "shipments": shipments_by_status,
            "agent_activities": agent_activities,
        },
        "food_security_gaps": gaps[:5],
        "active_hazards": active_hazards,
        "ports_disrupted": ports_disrupted,
        "explanation": (
            f"{len(gaps)} crop(s) with unmet open demand, {active_hazards} active "
            f"high/severe weather event(s), {ports_disrupted} port(s) not fully open."
        ),
    }


def forecast_demand(db: Session, crop_name: str) -> dict[str, Any]:
    """Forecast near-term demand from open demand history and price trend."""
    demands = (
        db.query(models.Demand)
        .filter(models.Demand.crop_name.ilike(crop_name))
        .all()
    )
    quantities = [d.quantity for d in demands if d.quantity]
    base = sum(quantities) / len(quantities) if quantities else 0.0

    price = get_pricing_provider().get_price(crop_name)
    factor = _TREND_FACTOR.get(price["trend"], 1.0)
    forecast = round(base * factor)

    return {
        "crop_name": crop_name,
        "forecast_quantity": forecast,
        "inputs": {
            "historical_demands": len(quantities),
            "average_demand": round(base, 1),
            "price_trend": price["trend"],
            "trend_factor": factor,
            "unit_price_usd": price.get("unit_price_usd"),
            "price_source": price.get("source"),
            "price_as_of": price.get("price_as_of"),
        },
        "explanation": (
            f"Average of {len(quantities)} recorded demand(s) is {base:.0f} units; "
            f"price trend is {price['trend']}, scaling the forecast by {factor}."
        ),
    }


def predict_spoilage(db: Session, crop: models.Crop) -> dict[str, Any]:
    """Estimate spoilage risk from time since harvest vs shelf life."""
    shelf_life = _SHELF_LIFE_DAYS.get((crop.crop_name or "").lower(), _DEFAULT_SHELF_LIFE)
    if crop.harvest_date is None:
        return {
            "crop_id": crop.id,
            "risk": "unknown",
            "explanation": "No harvest date recorded, so shelf life cannot be assessed.",
        }

    age_days = (date.today() - crop.harvest_date).days
    remaining = shelf_life - age_days
    if remaining <= 0:
        risk = "critical"
    elif remaining <= shelf_life * 0.25:
        risk = "high"
    elif remaining <= shelf_life * 0.5:
        risk = "medium"
    else:
        risk = "low"

    return {
        "crop_id": crop.id,
        "crop_name": crop.crop_name,
        "risk": risk,
        "inputs": {
            "harvest_date": crop.harvest_date.isoformat(),
            "age_days": age_days,
            "shelf_life_days": shelf_life,
            "remaining_days": remaining,
        },
        "explanation": (
            f"{crop.crop_name} harvested {age_days} day(s) ago with a "
            f"~{shelf_life}-day shelf life leaves {max(remaining, 0)} day(s); risk is {risk}."
        ),
    }


def predict_transport_delay(origin_island: str, destination_island: str) -> dict[str, Any]:
    """Estimate transit time and weather-driven delay for a lane."""
    transit = get_routing_provider().estimate_transit(origin_island, destination_island)
    weather = get_weather_provider().get_forecast(destination_island)
    delay = _RISK_DELAY_HOURS.get(weather["risk"], 0)

    return {
        "origin": origin_island,
        "destination": destination_island,
        "base_transit_hours": transit["transit_hours"],
        "expected_delay_hours": delay,
        "total_hours": transit["transit_hours"] + delay,
        "inputs": {"routing": transit, "weather": weather},
        "explanation": (
            f"Base transit is {transit['transit_hours']}h by {transit['mode']}; "
            f"{weather['risk']} weather risk at {destination_island} adds ~{delay}h."
        ),
    }


def predict_regional_shortage(db: Session, crop_name: str) -> dict[str, Any]:
    """Compare open demand against available supply for a crop."""
    supply = sum(
        c.quantity or 0
        for c in db.query(models.Crop).filter(models.Crop.crop_name.ilike(crop_name)).all()
    )
    open_demand = sum(
        d.quantity or 0
        for d in db.query(models.Demand)
        .filter(models.Demand.crop_name.ilike(crop_name), models.Demand.status == "open")
        .all()
    )
    gap = open_demand - supply
    shortage = gap > 0

    return {
        "crop_name": crop_name,
        "shortage_predicted": shortage,
        "gap": gap,
        "inputs": {"available_supply": supply, "open_demand": open_demand},
        "explanation": (
            f"Open demand ({open_demand}) exceeds available supply ({supply}) by {gap} units."
            if shortage
            else f"Available supply ({supply}) covers open demand ({open_demand})."
        ),
    }

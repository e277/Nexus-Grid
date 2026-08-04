"""Deterministic stub providers used until real adapters are wired.

Stubs are seeded by input so responses are stable across calls — good
enough for demos and tests, and honest about being synthetic (every
response carries ``"source": "stub"``).
"""

import hashlib
from typing import Any

from app.utils import utcnow_iso

_RISKS = ["low", "medium", "high"]
_TRENDS = ["falling", "stable", "rising"]


def _bucket(key: str, size: int) -> int:
    digest = hashlib.sha256(key.encode()).digest()
    return digest[0] % size


class StubWeatherProvider:
    def get_forecast(self, island: str) -> dict[str, Any]:
        risk = _RISKS[_bucket(f"weather:{island}", len(_RISKS))]
        return {
            "source": "stub",
            "island": island,
            "risk": risk,
            "summary": f"{risk} storm risk over the next 72h",
            "observed_at": utcnow_iso(),
        }

    def get_active_alerts(self) -> list[dict[str, Any]]:
        return []


class StubRoutingProvider:
    def estimate_transit(self, origin_island: str, destination_island: str) -> dict[str, Any]:
        if origin_island == destination_island:
            hours = 4
            mode = "land"
        else:
            hours = 12 + _bucket(f"route:{origin_island}->{destination_island}", 36)
            mode = "sea"
        return {
            "source": "stub",
            "origin": origin_island,
            "destination": destination_island,
            "mode": mode,
            "transit_hours": hours,
        }


class StubPricingProvider:
    def get_price(self, crop_name: str, island: str | None = None) -> dict[str, Any]:
        base = 1.0 + _bucket(f"price:{crop_name.lower()}", 40) / 10.0
        trend = _TRENDS[_bucket(f"trend:{crop_name.lower()}:{island}", len(_TRENDS))]
        return {
            "source": "stub",
            "crop_name": crop_name,
            "island": island,
            "unit_price_usd": round(base, 2),
            "trend": trend,
        }

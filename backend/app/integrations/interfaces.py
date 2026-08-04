"""Provider interfaces for external systems.

Everything the platform needs from the outside world is expressed as a
Protocol here, so a stub, a sandbox, or a production adapter can be
swapped in without touching callers (Phase 6 requirement).
"""

from typing import Any, Protocol


class WeatherProvider(Protocol):
    """Climate & hazard signals (e.g. CIMH, NOAA)."""

    def get_forecast(self, island: str) -> dict[str, Any]:
        """Return current risk outlook for an island."""
        ...

    def get_active_alerts(self) -> list[dict[str, Any]]:
        """Return active severe-weather alerts for the region."""
        ...


class RoutingProvider(Protocol):
    """Maps / routing (e.g. inter-island transit estimation)."""

    def estimate_transit(self, origin_island: str, destination_island: str) -> dict[str, Any]:
        """Return transit estimate: hours, mode, distance."""
        ...


class PricingProvider(Protocol):
    """Regional market pricing feeds."""

    def get_price(self, crop_name: str, island: str | None = None) -> dict[str, Any]:
        """Return current unit price and trend for a crop."""
        ...

"""Live weather provider — real data, no API key required.

- ``get_forecast``: Open-Meteo (api.open-meteo.com), a free keyless forecast
  API. Risk is derived from real max windspeed / precipitation-probability
  thresholds for the island's coordinates.
- ``get_active_alerts``: NOAA's National Hurricane Center current-storms
  feed (nhc.noaa.gov/CurrentStorms.json), the same authority named in this
  project's own architecture doc. An empty list is a real "no active
  storms" answer, not a placeholder.

Both calls use a short timeout and fall back to :mod:`app.integrations.stubs`
on any failure (network, timeout, unrecognized island) — callers always get
a usable response, honestly labeled by ``source``.
"""

import logging
from typing import Any

import httpx

from app.integrations.geo import lookup_island
from app.integrations.stubs import StubWeatherProvider
from app.utils import utcnow_iso

logger = logging.getLogger(__name__)

_TIMEOUT = 4.0
_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
_STORMS_URL = "https://www.nhc.noaa.gov/CurrentStorms.json"

_fallback = StubWeatherProvider()


def _classify_risk(max_wind_kmh: float, max_precip_pct: float) -> str:
    if max_wind_kmh >= 60 or max_precip_pct >= 85:
        return "high"
    if max_wind_kmh >= 35 or max_precip_pct >= 60:
        return "medium"
    return "low"


class OpenMeteoWeatherProvider:
    def get_forecast(self, island: str) -> dict[str, Any]:
        coords = lookup_island(island)
        if coords is None:
            logger.info("No coordinates for island %r; falling back to stub weather", island)
            return _fallback.get_forecast(island)

        try:
            response = httpx.get(
                _FORECAST_URL,
                params={
                    "latitude": coords[0],
                    "longitude": coords[1],
                    "daily": "precipitation_probability_max,windspeed_10m_max",
                    "forecast_days": 3,
                    "timezone": "auto",
                },
                timeout=_TIMEOUT,
            )
            response.raise_for_status()
            daily = response.json()["daily"]
            max_wind = max(daily["windspeed_10m_max"])
            max_precip = max(daily["precipitation_probability_max"])
            risk = _classify_risk(max_wind, max_precip)
            return {
                "source": "open-meteo",
                "island": island,
                "risk": risk,
                "summary": f"{risk} storm risk — up to {max_wind:.0f}km/h wind, {max_precip:.0f}% precipitation chance over the next 3 days",
                "max_windspeed_kmh": max_wind,
                "max_precipitation_probability_pct": max_precip,
                "observed_at": utcnow_iso(),
            }
        except Exception as exc:
            logger.warning("Open-Meteo forecast failed for %s: %s", island, exc)
            return _fallback.get_forecast(island)

    def get_active_alerts(self) -> list[dict[str, Any]]:
        try:
            response = httpx.get(_STORMS_URL, timeout=_TIMEOUT)
            response.raise_for_status()
            storms = response.json().get("activeStorms", [])
            return [
                {
                    "source": "noaa-nhc",
                    "name": storm.get("name"),
                    "classification": storm.get("classification"),
                    "latitude": storm.get("latitudeNumeric"),
                    "longitude": storm.get("longitudeNumeric"),
                    "movement": storm.get("movementDir"),
                    "intensity_kt": storm.get("intensity"),
                }
                for storm in storms
            ]
        except Exception as exc:
            logger.warning("NOAA NHC current-storms fetch failed: %s", exc)
            return _fallback.get_active_alerts()

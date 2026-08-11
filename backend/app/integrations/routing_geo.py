"""Geography-based routing provider — real inter-island distances, not a
guessed number.

No free/keyless live inter-island freight-routing API exists publicly, so
this computes the great-circle distance between each island's real
coordinates (:mod:`app.integrations.geo`) and derives a transit estimate
from a documented average speed. It's honestly a distance-based estimate,
not a live carrier booking API — labeled ``"source": "geo-estimate"``
rather than pretending otherwise. Falls back to the stub for islands
outside the coordinate table.
"""

import logging
from typing import Any

from app.integrations.geo import haversine_km, lookup_island
from app.integrations.stubs import StubRoutingProvider

logger = logging.getLogger(__name__)

# Average scheduled inter-island cargo/ferry speed, knots (~15) converted to km/h,
# plus a fixed port-handling overhead so short hops aren't unrealistically instant.
_AVG_SEA_SPEED_KMH = 15 * 1.852
_PORT_HANDLING_HOURS = 3.0

_fallback = StubRoutingProvider()


class GeoRoutingProvider:
    def estimate_transit(self, origin_island: str, destination_island: str) -> dict[str, Any]:
        if origin_island == destination_island:
            return {
                "source": "geo-estimate",
                "origin": origin_island,
                "destination": destination_island,
                "mode": "land",
                "transit_hours": 4,
            }

        origin = lookup_island(origin_island)
        destination = lookup_island(destination_island)
        if origin is None or destination is None:
            logger.info(
                "No coordinates for %r -> %r; falling back to stub routing",
                origin_island,
                destination_island,
            )
            return _fallback.estimate_transit(origin_island, destination_island)

        distance_km = haversine_km(origin, destination)
        hours = round(distance_km / _AVG_SEA_SPEED_KMH + _PORT_HANDLING_HOURS, 1)
        return {
            "source": "geo-estimate",
            "origin": origin_island,
            "destination": destination_island,
            "mode": "sea",
            "distance_km": round(distance_km, 1),
            "transit_hours": hours,
        }

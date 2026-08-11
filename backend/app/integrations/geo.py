"""Real coordinates for CARICOM islands, shared by the weather and routing
providers so both work from the same ground truth.

Coordinates are each island's capital/main port (approximate, public
knowledge) — enough precision for regional weather lookups and
inter-island distance estimates, not for navigation.
"""

import math

# (latitude, longitude) of each island's capital / main port
ISLAND_COORDINATES: dict[str, tuple[float, float]] = {
    "jamaica": (17.9712, -76.7936),  # Kingston
    "trinidad": (10.6549, -61.5019),  # Port of Spain
    "trinidad and tobago": (10.6549, -61.5019),
    "barbados": (13.1132, -59.5988),  # Bridgetown
    "saint lucia": (14.0101, -60.9875),  # Castries
    "st. lucia": (14.0101, -60.9875),
    "st lucia": (14.0101, -60.9875),
    "dominica": (15.3092, -61.3794),  # Roseau
    "grenada": (12.0561, -61.7488),  # St. George's
    "antigua": (17.1274, -61.8468),  # St. John's
    "antigua and barbuda": (17.1274, -61.8468),
    "saint kitts and nevis": (17.3026, -62.7177),  # Basseterre
    "st. kitts": (17.3026, -62.7177),
    "st kitts": (17.3026, -62.7177),
    "saint vincent": (13.1587, -61.2248),  # Kingstown
    "st. vincent": (13.1587, -61.2248),
    "guyana": (6.8013, -58.1551),  # Georgetown
    "suriname": (5.8520, -55.2038),  # Paramaribo
    "belize": (17.5046, -88.1962),  # Belize City
    "bahamas": (25.0480, -77.3554),  # Nassau
    "martinique": (14.6161, -61.0588),  # Fort-de-France
    "guadeloupe": (16.2650, -61.5510),  # Pointe-à-Pitre
    "haiti": (18.5944, -72.3074),  # Port-au-Prince
    "dominican republic": (18.4861, -69.9312),  # Santo Domingo
}


def lookup_island(island: str | None) -> tuple[float, float] | None:
    """Case-insensitive lookup; returns None for unrecognized/blank names."""
    if not island:
        return None
    return ISLAND_COORDINATES.get(island.strip().lower())


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle distance between two (lat, lon) points, in kilometers."""
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))

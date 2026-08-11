"""Reference pricing provider — real benchmark prices and real crop
seasonality, not an arbitrary hash of the crop name.

No free, reliable, keyless *live* commodity-price API covers these crops at
island granularity (FAOSTAT's API was unreachable — HTTP 521 — as of
writing, and is a poor fit for a synchronous request path even when up).
Instead:

- ``unit_price_usd`` is a static reference table of approximate Caribbean
  wholesale prices (USD/kg), a representative order-of-magnitude snapshot —
  not live, and labeled accordingly via ``"price_as_of"``.
- ``trend`` is derived from real Caribbean crop-harvest seasonality against
  the current calendar month, so it reflects an actual agronomic signal
  instead of a random pick.

This is still an approximation, not a live market feed — see ``source``.
"""

from datetime import date
from typing import Any

# Approximate Caribbean wholesale reference prices, USD/kg.
_REFERENCE_PRICE_USD_PER_KG = {
    "banana": 0.60,
    "mango": 1.20,
    "tomato": 1.50,
    "yam": 1.00,
    "pepper": 2.50,
    "cassava": 0.70,
    "plantain": 0.80,
    "sweet potato": 0.90,
    "breadfruit": 1.10,
}
_DEFAULT_PRICE_USD_PER_KG = 1.50
_PRICE_AS_OF = "2024 Caribbean wholesale reference (approximate)"

# Real Caribbean peak-harvest windows: price falls when supply peaks,
# rises in the scarce months before the next harvest. Months not listed
# for a crop are "stable".
_FALLING_MONTHS = {
    "banana": set(range(1, 13)),  # harvested year-round
    "plantain": set(range(1, 13)),
    "mango": {4, 5, 6, 7, 8},
    "tomato": {12, 1, 2, 3, 4},
    "yam": {8, 9, 10, 11, 12},
    "cassava": {8, 9, 10, 11, 12},
    "sweet potato": {11, 12, 1, 2},
    "breadfruit": {6, 7, 8, 9, 10},
}
_RISING_MONTHS = {
    "mango": {11, 12, 1, 2},
    "tomato": {6, 7, 8, 9},
    "yam": {4, 5, 6, 7},
    "pepper": {6, 7, 8, 9},
}


def _seasonal_trend(crop_key: str, today: date) -> str:
    month = today.month
    if month in _FALLING_MONTHS.get(crop_key, set()):
        return "falling"
    if month in _RISING_MONTHS.get(crop_key, set()):
        return "rising"
    return "stable"


class ReferencePricingProvider:
    def get_price(self, crop_name: str, island: str | None = None) -> dict[str, Any]:
        crop_key = crop_name.strip().lower()
        price = _REFERENCE_PRICE_USD_PER_KG.get(crop_key, _DEFAULT_PRICE_USD_PER_KG)
        trend = _seasonal_trend(crop_key, date.today())
        return {
            "source": "reference",
            "crop_name": crop_name,
            "island": island,
            "unit_price_usd": price,
            "trend": trend,
            "price_as_of": _PRICE_AS_OF,
            "trend_basis": "Caribbean peak-harvest seasonality for the current month",
        }

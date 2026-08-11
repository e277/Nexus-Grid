"""Provider registry: resolves the configured adapter for each interface.

Real adapters (``open_meteo``/``geo``/``reference``) are the default —
each degrades gracefully to ``stub`` internally on failure (see their
modules) — but ``stub`` stays registered by name for tests or an explicit
opt-out. Callers never change either way.
"""

from functools import lru_cache

from app.integrations.interfaces import PricingProvider, RoutingProvider, WeatherProvider
from app.integrations.pricing_reference import ReferencePricingProvider
from app.integrations.routing_geo import GeoRoutingProvider
from app.integrations.stubs import (
    StubPricingProvider,
    StubRoutingProvider,
    StubWeatherProvider,
)
from app.integrations.weather_live import OpenMeteoWeatherProvider

_WEATHER_PROVIDERS = {"stub": StubWeatherProvider, "open_meteo": OpenMeteoWeatherProvider}
_ROUTING_PROVIDERS = {"stub": StubRoutingProvider, "geo": GeoRoutingProvider}
_PRICING_PROVIDERS = {"stub": StubPricingProvider, "reference": ReferencePricingProvider}


@lru_cache
def get_weather_provider(name: str = "open_meteo") -> WeatherProvider:
    return _WEATHER_PROVIDERS[name]()


@lru_cache
def get_routing_provider(name: str = "geo") -> RoutingProvider:
    return _ROUTING_PROVIDERS[name]()


@lru_cache
def get_pricing_provider(name: str = "reference") -> PricingProvider:
    return _PRICING_PROVIDERS[name]()

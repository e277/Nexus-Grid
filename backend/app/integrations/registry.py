"""Provider registry: resolves the configured adapter for each interface.

Settings select the implementation (only ``stub`` exists today); real
adapters register here as they are built, and callers never change.
"""

from functools import lru_cache

from app.integrations.interfaces import PricingProvider, RoutingProvider, WeatherProvider
from app.integrations.stubs import (
    StubPricingProvider,
    StubRoutingProvider,
    StubWeatherProvider,
)

_WEATHER_PROVIDERS = {"stub": StubWeatherProvider}
_ROUTING_PROVIDERS = {"stub": StubRoutingProvider}
_PRICING_PROVIDERS = {"stub": StubPricingProvider}


@lru_cache
def get_weather_provider(name: str = "stub") -> WeatherProvider:
    return _WEATHER_PROVIDERS[name]()


@lru_cache
def get_routing_provider(name: str = "stub") -> RoutingProvider:
    return _ROUTING_PROVIDERS[name]()


@lru_cache
def get_pricing_provider(name: str = "stub") -> PricingProvider:
    return _PRICING_PROVIDERS[name]()

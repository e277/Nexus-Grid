"""Event bus core: in-process backend and the module-level proxy.

``event_bus`` is a proxy so call sites (`from app.events import event_bus`)
never change when the backend does. ``EventBus`` is the default and only
in-process dispatcher. Subscriptions registered on the proxy are replayed
onto any newly configured backend.

Event names follow the dotted convention from the roadmap, e.g.
``crop.harvest.ready``, ``shipment.delayed``, ``weather.alert``.
"""

import logging
from collections import defaultdict
from typing import Any, Callable, Protocol

logger = logging.getLogger(__name__)

Handler = Callable[[str, dict[str, Any]], None]


class EventBackend(Protocol):
    def subscribe(self, event_name: str, handler: Handler) -> None: ...

    def publish(self, event_name: str, payload: dict[str, Any] | None = None) -> int: ...


class EventBus:
    """Synchronous in-process publish/subscribe dispatcher."""

    def __init__(self) -> None:
        self._handlers: dict[str, list[Handler]] = defaultdict(list)

    def subscribe(self, event_name: str, handler: Handler) -> None:
        self._handlers[event_name].append(handler)

    def publish(self, event_name: str, payload: dict[str, Any] | None = None) -> int:
        """Invoke all handlers for the event; returns how many ran.

        A failing handler is logged and skipped so one subscriber cannot
        break delivery to the others.
        """
        payload = payload or {}
        handlers = self._handlers.get(event_name, [])
        delivered = 0
        for handler in handlers:
            try:
                handler(event_name, payload)
                delivered += 1
            except Exception:
                logger.exception("Event handler failed for %s", event_name)
        return delivered


class EventBusProxy:
    """Stable facade over the active backend.

    Keeps its own subscription list so swapping backends (at startup)
    re-registers every handler on the new backend.
    """

    def __init__(self, backend: EventBackend) -> None:
        self._backend = backend
        self._subscriptions: list[tuple[str, Handler]] = []

    @property
    def backend(self) -> EventBackend:
        return self._backend

    def set_backend(self, backend: EventBackend) -> None:
        self._backend = backend
        for event_name, handler in self._subscriptions:
            backend.subscribe(event_name, handler)

    def subscribe(self, event_name: str, handler: Handler) -> None:
        self._subscriptions.append((event_name, handler))
        self._backend.subscribe(event_name, handler)

    def publish(self, event_name: str, payload: dict[str, Any] | None = None) -> int:
        return self._backend.publish(event_name, payload)

    async def start(self) -> None:
        """Start the backend's consumer, if it has one."""
        start = getattr(self._backend, "start", None)
        if start is not None:
            await start()

    async def stop(self) -> None:
        stop = getattr(self._backend, "stop", None)
        if stop is not None:
            await stop()


event_bus = EventBusProxy(EventBus())

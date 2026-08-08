"""Rate limiting middleware with an in-memory sliding window."""

import logging
import time
from collections import defaultdict, deque

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.config import get_settings

logger = logging.getLogger(__name__)

_WINDOW_SECONDS = 60


class _MemoryWindow:
    """Per-process sliding window."""

    def __init__(self) -> None:
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, client: str, limit: int) -> bool:
        now = time.monotonic()
        window = self.hits[client]
        while window and now - window[0] > _WINDOW_SECONDS:
            window.popleft()
        if len(window) >= limit:
            return False
        window.append(now)
        return True


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, limit: int | None = None, backend: str | None = None) -> None:
        super().__init__(app)
        settings = get_settings()
        self.limit = limit if limit is not None else settings.rate_limit_per_minute
        self._memory = _MemoryWindow()

        logger.info("Rate limiter backend: memory (%d/min)", self.limit)

    def _allow(self, client: str) -> bool:
        return self._memory.allow(client, self.limit)

    async def dispatch(self, request: Request, call_next):
        client = request.client.host if request.client else "unknown"
        if not self._allow(client):
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Try again shortly."},
                headers={"Retry-After": "60"},
            )
        return await call_next(request)

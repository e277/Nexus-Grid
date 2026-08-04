"""Rate limiting middleware with in-memory and Redis backends.

- ``memory`` (default): per-process sliding window — fine for one replica.
- ``redis``: fixed one-minute window shared across replicas
  (``INCR`` + ``EXPIRE`` on ``ratelimit:{client}:{minute}``).

Redis errors fail open to the in-memory window (logged once) so the API
never hard-fails because the limiter's store is down.
"""

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


class _RedisWindow:
    """Fixed one-minute window shared across replicas."""

    def __init__(self, redis_url: str) -> None:
        import redis

        self._client = redis.Redis.from_url(redis_url, decode_responses=True)

    def allow(self, client: str, limit: int) -> bool:
        minute = int(time.time() // _WINDOW_SECONDS)
        key = f"ratelimit:{client}:{minute}"
        pipe = self._client.pipeline()
        pipe.incr(key)
        pipe.expire(key, _WINDOW_SECONDS)
        count, _ = pipe.execute()
        return int(count) <= limit


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, limit: int | None = None, backend: str | None = None) -> None:
        super().__init__(app)
        settings = get_settings()
        self.limit = limit if limit is not None else settings.rate_limit_per_minute
        self._memory = _MemoryWindow()
        self._redis: _RedisWindow | None = None
        self._redis_error_logged = False

        backend = backend if backend is not None else settings.rate_limit_backend
        if backend == "redis":
            self._redis = _RedisWindow(settings.redis_url)
            logger.info("Rate limiter backend: redis (%d/min)", self.limit)
        else:
            logger.info("Rate limiter backend: memory (%d/min)", self.limit)

    def _allow(self, client: str) -> bool:
        if self._redis is not None:
            try:
                allowed = self._redis.allow(client, self.limit)
                self._redis_error_logged = False
                return allowed
            except Exception:
                if not self._redis_error_logged:
                    logger.exception("Redis rate limiter failed; failing open to memory window")
                    self._redis_error_logged = True
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

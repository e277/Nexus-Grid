"""Rate limiter enforcement (memory backend)."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.rate_limit import RateLimitMiddleware


def test_rate_limit_returns_429_over_limit():
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware, limit=3, backend="memory")

    @app.get("/ping")
    def ping():
        return {"ok": True}

    client = TestClient(app)
    for _ in range(3):
        assert client.get("/ping").status_code == 200

    blocked = client.get("/ping")
    assert blocked.status_code == 429
    assert blocked.headers["Retry-After"] == "60"

"""In-process request metrics exposed in Prometheus text format.

Counters are keyed by route template (not raw path) to keep label
cardinality bounded. Suitable for a single process; a real Prometheus
client library can replace this without changing the endpoint.
"""

import time
from collections import defaultdict

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

_started_at = time.time()
_requests: dict[tuple[str, str, int], int] = defaultdict(int)
_duration_sum: dict[tuple[str, str], float] = defaultdict(float)
_duration_count: dict[tuple[str, str], int] = defaultdict(int)


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        elapsed = time.perf_counter() - start

        route = request.scope.get("route")
        path = getattr(route, "path", request.url.path)
        method = request.method

        _requests[(method, path, response.status_code)] += 1
        _duration_sum[(method, path)] += elapsed
        _duration_count[(method, path)] += 1
        return response


def render_metrics() -> str:
    """Render collected counters in Prometheus exposition format."""
    lines = [
        "# HELP nexusgrid_uptime_seconds Time since process start.",
        "# TYPE nexusgrid_uptime_seconds gauge",
        f"nexusgrid_uptime_seconds {time.time() - _started_at:.0f}",
        "# HELP nexusgrid_http_requests_total HTTP requests by route and status.",
        "# TYPE nexusgrid_http_requests_total counter",
    ]
    for (method, path, code), count in sorted(_requests.items()):
        lines.append(
            f'nexusgrid_http_requests_total{{method="{method}",path="{path}",status="{code}"}} {count}'
        )
    lines += [
        "# HELP nexusgrid_http_request_duration_seconds Request duration sums by route.",
        "# TYPE nexusgrid_http_request_duration_seconds summary",
    ]
    for (method, path), total in sorted(_duration_sum.items()):
        count = _duration_count[(method, path)]
        lines.append(
            f'nexusgrid_http_request_duration_seconds_sum{{method="{method}",path="{path}"}} {total:.4f}'
        )
        lines.append(
            f'nexusgrid_http_request_duration_seconds_count{{method="{method}",path="{path}"}} {count}'
        )
    return "\n".join(lines) + "\n"

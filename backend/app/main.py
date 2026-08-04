"""Nexus-Grid application entry point."""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.agents.runner import start_agents
from app.api import (
    auth,
    buyers,
    climate,
    crops,
    customs,
    demands,
    farmers,
    health,
    intelligence,
    logistics,
    observability,
    shipments,
    workflow,
)
from fastapi import Depends

from app.config import get_settings
from app.core.logging import configure_logging
from app.core.metrics import MetricsMiddleware
from app.core.rate_limit import RateLimitMiddleware
from app.core.security import get_current_user, require_role
from app.database import Base, engine
from app.events import configure_event_bus, event_bus, register_event_handlers


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    settings = get_settings()

    # Create DB tables if they do not already exist (Alembic owns real migrations)
    Base.metadata.create_all(bind=engine)

    configure_event_bus(settings.event_bus_backend, settings.redis_url)
    register_event_handlers()
    await event_bus.start()

    if not settings.skip_agent_startup:
        app.state.agent_task = start_agents(app)

    yield

    task = getattr(app.state, "agent_task", None)
    if task is not None:
        app.state.agent_task = None
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    await event_bus.stop()


settings = get_settings()
app = FastAPI(
    title=settings.app_name,
    description=settings.app_description,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(MetricsMiddleware)
app.add_middleware(RateLimitMiddleware)

# Every route requires a valid JWT except health, metrics, auth, and "/".
# Write endpoints additionally declare require_role(...) in their routers.
AUTHENTICATED = [Depends(get_current_user)]
GOVERNMENT_ONLY = [Depends(require_role("government"))]

# Platform (public)
app.include_router(health.router, prefix="/health", tags=["health"])
app.include_router(health.metrics_router, prefix="/metrics", tags=["monitoring"])
app.include_router(auth.router, prefix="/auth", tags=["auth"])

# Core domain
app.include_router(farmers.router, prefix="/farmers", tags=["farmers"], dependencies=AUTHENTICATED)
app.include_router(crops.router, prefix="/crops", tags=["crops"], dependencies=AUTHENTICATED)
app.include_router(buyers.router, prefix="/buyers", tags=["buyers"], dependencies=AUTHENTICATED)
app.include_router(demands.router, prefix="/demands", tags=["demands"], dependencies=AUTHENTICATED)
app.include_router(
    shipments.router, prefix="/shipments", tags=["shipments"], dependencies=AUTHENTICATED
)

# Logistics network
app.include_router(
    logistics.carriers_router, prefix="/carriers", tags=["logistics"], dependencies=AUTHENTICATED
)
app.include_router(
    logistics.warehouses_router,
    prefix="/warehouses",
    tags=["logistics"],
    dependencies=AUTHENTICATED,
)
app.include_router(
    logistics.ports_router, prefix="/ports", tags=["logistics"], dependencies=AUTHENTICATED
)
app.include_router(
    logistics.trade_routes_router,
    prefix="/trade-routes",
    tags=["logistics"],
    dependencies=AUTHENTICATED,
)

# Climate & customs
app.include_router(
    climate.router, prefix="/weather-events", tags=["climate"], dependencies=AUTHENTICATED
)
app.include_router(
    customs.router, prefix="/customs-documents", tags=["customs"], dependencies=AUTHENTICATED
)

# Orchestration & observability
app.include_router(
    workflow.router, prefix="/workflow", tags=["workflow"], dependencies=AUTHENTICATED
)
app.include_router(
    intelligence.router, prefix="/intelligence", tags=["intelligence"], dependencies=AUTHENTICATED
)
app.include_router(
    observability.agent_activities_router,
    prefix="/agent-activities",
    tags=["observability"],
    dependencies=GOVERNMENT_ONLY,
)
app.include_router(
    observability.audit_logs_router,
    prefix="/audit-logs",
    tags=["observability"],
    dependencies=GOVERNMENT_ONLY,
)


@app.get("/")
def home():
    return {
        "system": settings.app_name,
        "status": "online",
    }

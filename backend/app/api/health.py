"""Liveness, readiness, and metrics endpoints for orchestration and monitoring."""

from fastapi import APIRouter, Depends
from fastapi.responses import PlainTextResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.metrics import render_metrics
from app.database import get_db

router = APIRouter()
metrics_router = APIRouter()


@metrics_router.get("/", response_class=PlainTextResponse)
def metrics():
    """Prometheus-format process metrics."""
    return render_metrics()


@router.get("/")
def health():
    """Liveness probe: the process is up and serving requests."""
    settings = get_settings()
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
    }


@router.get("/db")
def health_db(db: Session = Depends(get_db)):
    """Readiness probe: verifies the database connection is usable."""
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "reachable"}
    except Exception as exc:
        return {"status": "degraded", "database": "unreachable", "detail": str(exc)}

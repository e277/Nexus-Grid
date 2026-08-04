"""Time helpers shared across workflows and agents."""

from datetime import datetime, timezone


def utcnow_iso() -> str:
    """Current UTC time as an ISO-8601 string with a Z suffix."""
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

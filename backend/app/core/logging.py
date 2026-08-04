"""Central logging configuration for the application."""

import logging
import sys

from app.config import get_settings

LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"


def configure_logging() -> None:
    """Configure the root logger once, using the level from settings.

    Safe to call multiple times: handlers are only attached on the first call.
    """
    root = logging.getLogger()
    if root.handlers:
        return

    settings = get_settings()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(LOG_FORMAT))
    root.addHandler(handler)
    root.setLevel(settings.log_level.upper())

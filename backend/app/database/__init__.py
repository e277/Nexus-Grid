"""Database engine, session factory, and declarative base.

The connection URL comes from application settings; DATABASE_URL (or
TEST_DATABASE_URL in tests) overrides the default via the environment.
"""

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import get_settings

DATABASE_URL = (
    os.getenv("DATABASE_URL")
    or os.getenv("TEST_DATABASE_URL")
    or get_settings().database_url
)

engine_kwargs = {}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
    if ":memory:" in DATABASE_URL:
        # Share the single in-memory database across threads (tests)
        engine_kwargs["poolclass"] = StaticPool

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency that yields a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

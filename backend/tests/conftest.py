import os
import sys

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SKIP_AGENT_STARTUP", "1")

import itertools

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base

_user_counter = itertools.count()


def auth_headers(client, role: str = "admin") -> dict[str, str]:
    """Register a fresh user with the given role and return Bearer headers.

    Admin passes every require_role check, so tests use role="admin" unless
    they are asserting role-specific behavior.
    """
    email = f"user{next(_user_counter)}-{role}@nexusgrid.dev"
    password = "test-pass-123"
    register = client.post(
        "/auth/register", json={"email": email, "password": password, "role": role}
    )
    assert register.status_code == 201, register.text
    login = client.post("/auth/token", data={"username": email, "password": password})
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


@pytest.fixture(scope="session")
def engine():
    url = os.getenv("TEST_DATABASE_URL", "sqlite:///:memory:")
    engine = create_engine(url)
    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture
def db_session(engine):
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()

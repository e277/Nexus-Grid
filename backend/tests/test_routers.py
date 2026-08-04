import pytest
from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app)


def test_home():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json().get("status") == "online"

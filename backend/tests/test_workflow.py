from conftest import auth_headers
from fastapi.testclient import TestClient

from app.main import app


def test_workflow_trigger():
    payload = {
        "crop_id": 1,
        "crop_name": "Mango",
        "farmer_id": 1,
        "quantity": 1500,
        "event": "surplus",
        "message": "High inventory detected",
    }

    with TestClient(app) as client:
        # Requires the government role (admin bypass included)
        assert client.post("/workflow/trigger", json=payload).status_code == 401

        h = auth_headers(client, role="government")
        response = client.post("/workflow/trigger", json=payload, headers=h)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "triggered"
        assert "result" in data
        assert data["result"]["input"]["crop_name"] == "Mango"
        assert isinstance(data["result"]["updates"], list)
        assert isinstance(data["result"]["values"], list)

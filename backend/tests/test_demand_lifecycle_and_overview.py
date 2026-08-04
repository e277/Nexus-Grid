"""Demand status lifecycle and the intelligence overview endpoint."""

from conftest import auth_headers
from fastapi.testclient import TestClient

from app.main import app


def test_demand_status_lifecycle():
    with TestClient(app) as client:
        h = auth_headers(client)  # admin

        buyer = client.post("/buyers/", json={"name": "LifecycleCo"}, headers=h)
        demand = client.post(
            "/demands/",
            json={"buyer_id": buyer.json()["id"], "crop_name": "Cocoa", "quantity": 300},
            headers=h,
        )
        demand_id = demand.json()["id"]

        # open -> fulfilled is not allowed (must match first)
        invalid = client.patch(
            f"/demands/{demand_id}/status", json={"status": "fulfilled"}, headers=h
        )
        assert invalid.status_code == 409

        matched = client.patch(
            f"/demands/{demand_id}/status", json={"status": "matched"}, headers=h
        )
        assert matched.status_code == 200
        assert matched.json()["status"] == "matched"

        fulfilled = client.patch(
            f"/demands/{demand_id}/status", json={"status": "fulfilled"}, headers=h
        )
        assert fulfilled.status_code == 200

        # terminal: no further transitions
        reopened = client.patch(
            f"/demands/{demand_id}/status", json={"status": "open"}, headers=h
        )
        assert reopened.status_code in (409, 422)

        # farmer role may not drive demand status
        farmer_h = auth_headers(client, role="farmer")
        denied = client.patch(
            f"/demands/{demand_id}/status", json={"status": "cancelled"}, headers=farmer_h
        )
        assert denied.status_code == 403


def test_intelligence_overview():
    with TestClient(app) as client:
        h = auth_headers(client)  # admin

        farmer = client.post("/farmers/", json={"name": "OvFarm"}, headers=h)
        client.post(
            "/crops/",
            json={"farmer_id": farmer.json()["id"], "crop_name": "Sorrel", "quantity": 100},
            headers=h,
        )
        buyer = client.post("/buyers/", json={"name": "OvBuyer"}, headers=h)
        client.post(
            "/demands/",
            json={"buyer_id": buyer.json()["id"], "crop_name": "Sorrel", "quantity": 900},
            headers=h,
        )

        overview = client.get("/intelligence/overview", headers=h)
        assert overview.status_code == 200
        body = overview.json()

        assert body["health"] in {"healthy", "strained", "at_risk"}
        assert body["counts"]["farmers"] >= 1
        assert body["counts"]["open_demands"] >= 1
        gaps = {g["crop_name"]: g for g in body["food_security_gaps"]}
        assert "sorrel" in gaps
        assert gaps["sorrel"]["gap"] == 800
        assert "explanation" in body

        # any authenticated role can read the overview
        farmer_h = auth_headers(client, role="farmer")
        assert client.get("/intelligence/overview", headers=farmer_h).status_code == 200
        # but not unauthenticated
        assert client.get("/intelligence/overview").status_code == 401

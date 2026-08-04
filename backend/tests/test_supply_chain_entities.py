"""End-to-end API tests for the core entities: buyer, demand, shipment."""

from conftest import auth_headers
from fastapi.testclient import TestClient

from app.main import app


def test_buyer_demand_shipment_flow():
    # Context manager runs the lifespan so tables are created
    with TestClient(app) as client:
        h = auth_headers(client)  # admin: passes every role gate

        # Farmer + crop are prerequisites for a shipment
        farmer = client.post(
            "/farmers/",
            json={"name": "Ana", "island": "St. Lucia", "crops": "banana", "capacity": 10},
            headers=h,
        )
        assert farmer.status_code == 201
        crop = client.post(
            "/crops/",
            json={"farmer_id": farmer.json()["id"], "crop_name": "Banana", "quantity": 1500},
            headers=h,
        )
        assert crop.status_code == 201

        # Buyer
        buyer = client.post(
            "/buyers/",
            json={"name": "IslandMart", "island": "Barbados", "buyer_type": "wholesaler"},
            headers=h,
        )
        assert buyer.status_code == 201
        buyer_id = buyer.json()["id"]

        # Demand referencing the buyer
        demand = client.post(
            "/demands/",
            json={"buyer_id": buyer_id, "crop_name": "Banana", "quantity": 800},
            headers=h,
        )
        assert demand.status_code == 201
        assert demand.json()["status"] == "open"

        # Demand for a missing buyer is rejected
        missing = client.post(
            "/demands/", json={"buyer_id": 9999, "crop_name": "Yam", "quantity": 10}, headers=h
        )
        assert missing.status_code == 404

        # Shipment linking crop and demand
        shipment = client.post(
            "/shipments/",
            json={
                "crop_id": crop.json()["id"],
                "demand_id": demand.json()["id"],
                "carrier": "CariFreight",
                "origin_island": "St. Lucia",
                "destination_island": "Barbados",
                "quantity": 800,
            },
            headers=h,
        )
        assert shipment.status_code == 201
        shipment_id = shipment.json()["id"]
        assert shipment.json()["status"] == "planned"

        # Valid lifecycle: planned -> in_transit -> delivered
        departed = client.patch(
            f"/shipments/{shipment_id}/status", json={"status": "in_transit"}, headers=h
        )
        assert departed.status_code == 200
        assert departed.json()["departed_at"] is not None

        delivered = client.patch(
            f"/shipments/{shipment_id}/status", json={"status": "delivered"}, headers=h
        )
        assert delivered.status_code == 200
        assert delivered.json()["delivered_at"] is not None

        # Invalid transition: delivered -> in_transit
        invalid = client.patch(
            f"/shipments/{shipment_id}/status", json={"status": "in_transit"}, headers=h
        )
        assert invalid.status_code == 409


def test_routes_require_authentication_and_role():
    with TestClient(app) as client:
        # No token: reads and writes are rejected
        assert client.get("/farmers/").status_code == 401
        assert client.post("/farmers/", json={"name": "X"}).status_code == 401

        # Authenticated but wrong role: farmer cannot create shipments
        farmer_h = auth_headers(client, role="farmer")
        denied = client.post(
            "/shipments/",
            json={
                "crop_id": 1,
                "origin_island": "A",
                "destination_island": "B",
                "quantity": 1,
            },
            headers=farmer_h,
        )
        assert denied.status_code == 403

        # Farmer can read domain data and create crops for an existing farmer
        assert client.get("/crops/", headers=farmer_h).status_code == 200
        created = client.post("/farmers/", json={"name": "Roleful"}, headers=farmer_h)
        assert created.status_code == 201

        # Observability is government-gated: farmer denied, government allowed
        assert client.get("/agent-activities/", headers=farmer_h).status_code == 403
        gov_h = auth_headers(client, role="government")
        assert client.get("/agent-activities/", headers=gov_h).status_code == 200


def test_health_endpoints():
    with TestClient(app) as client:
        live = client.get("/health/")
        assert live.status_code == 200
        assert live.json()["status"] == "ok"

        ready = client.get("/health/db")
        assert ready.status_code == 200
        assert ready.json()["database"] == "reachable"

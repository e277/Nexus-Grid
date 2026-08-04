"""API tests for logistics network entities and the event-driven agents."""

from conftest import auth_headers
from fastapi.testclient import TestClient

from app.main import app


def test_ports_routes_and_climate_agent_pipeline():
    with TestClient(app) as client:
        h = auth_headers(client)  # admin

        # Ports
        origin = client.post(
            "/ports/", json={"name": "Port Castries", "island": "St. Lucia"}, headers=h
        )
        dest = client.post(
            "/ports/", json={"name": "Bridgetown Port", "island": "Barbados"}, headers=h
        )
        assert origin.status_code == 201 and dest.status_code == 201

        # Trade route between the ports; unknown port is rejected
        route = client.post(
            "/trade-routes/",
            json={
                "name": "STL-BGI weekly",
                "origin_port_id": origin.json()["id"],
                "destination_port_id": dest.json()["id"],
                "transit_hours": 18,
            },
            headers=h,
        )
        assert route.status_code == 201
        bad_route = client.post(
            "/trade-routes/",
            json={"name": "ghost", "origin_port_id": 999, "destination_port_id": 998},
            headers=h,
        )
        assert bad_route.status_code == 404

        # Carrier and warehouse
        carrier = client.post(
            "/carriers/", json={"name": "CariFreight", "capacity": 5000}, headers=h
        )
        assert carrier.status_code == 201
        warehouse = client.post(
            "/warehouses/",
            json={"name": "Cold Hub", "island": "Barbados", "cold_storage": True},
            headers=h,
        )
        assert warehouse.status_code == 201

        # Port status transition
        closed = client.patch(
            f"/ports/{origin.json()['id']}/status", json={"status": "closed"}, headers=h
        )
        assert closed.status_code == 200
        assert closed.json()["status"] == "closed"

        # Weather event publishes weather.alert -> climate agent runs and
        # records an AgentActivity via the supervisor
        event = client.post(
            "/weather-events/",
            json={
                "event_type": "hurricane",
                "severity": "severe",
                "affected_islands": "St. Lucia, Barbados",
            },
            headers=h,
        )
        assert event.status_code == 201

        activities = client.get(
            "/agent-activities/", params={"agent_name": "climate_risk"}, headers=h
        )
        assert activities.status_code == 200
        assert len(activities.json()) >= 1
        supervisor_acts = client.get(
            "/agent-activities/", params={"agent_name": "supervisor"}, headers=h
        )
        assert len(supervisor_acts.json()) >= 1


def test_customs_document_flow_and_agent():
    with TestClient(app) as client:
        h = auth_headers(client)  # admin

        farmer = client.post("/farmers/", json={"name": "Jo", "island": "Dominica"}, headers=h)
        crop = client.post(
            "/crops/",
            json={"farmer_id": farmer.json()["id"], "crop_name": "Plantain", "quantity": 900},
            headers=h,
        )
        shipment = client.post(
            "/shipments/",
            json={
                "crop_id": crop.json()["id"],
                "origin_island": "Dominica",
                "destination_island": "Antigua",
                "quantity": 500,
            },
            headers=h,
        )
        assert shipment.status_code == 201
        shipment_id = shipment.json()["id"]

        # Manual document lifecycle draft -> submitted -> approved
        doc = client.post(
            "/customs-documents/",
            json={"shipment_id": shipment_id, "document_type": "invoice"},
            headers=h,
        )
        assert doc.status_code == 201
        doc_id = doc.json()["id"]

        submitted = client.patch(
            f"/customs-documents/{doc_id}/status", json={"status": "submitted"}, headers=h
        )
        assert submitted.status_code == 200
        assert submitted.json()["submitted_at"] is not None

        approved = client.patch(
            f"/customs-documents/{doc_id}/status", json={"status": "approved"}, headers=h
        )
        assert approved.status_code == 200
        assert approved.json()["decided_at"] is not None

        # Invalid transition approved -> submitted
        invalid = client.patch(
            f"/customs-documents/{doc_id}/status", json={"status": "submitted"}, headers=h
        )
        assert invalid.status_code == 409

        # shipment.departed triggers the customs agent, which files the
        # remaining required documents automatically
        departed = client.patch(
            f"/shipments/{shipment_id}/status", json={"status": "in_transit"}, headers=h
        )
        assert departed.status_code == 200

        docs = client.get(
            "/customs-documents/", params={"shipment_id": shipment_id}, headers=h
        )
        types = {d["document_type"] for d in docs.json()}
        assert {"invoice", "certificate_of_origin", "phytosanitary"} <= types


def test_intelligence_endpoints():
    with TestClient(app) as client:
        h = auth_headers(client)  # admin

        buyer = client.post("/buyers/", json={"name": "FreshCo"}, headers=h)
        client.post(
            "/demands/",
            json={"buyer_id": buyer.json()["id"], "crop_name": "Ginger", "quantity": 400},
            headers=h,
        )

        forecast = client.get("/intelligence/demand-forecast/Ginger", headers=h)
        assert forecast.status_code == 200
        body = forecast.json()
        assert body["forecast_quantity"] > 0
        assert "explanation" in body

        shortage = client.get("/intelligence/shortage/Ginger", headers=h)
        assert shortage.status_code == 200
        assert shortage.json()["shortage_predicted"] is True

        delay = client.get(
            "/intelligence/transport-delay",
            params={"origin_island": "Grenada", "destination_island": "Trinidad"},
            headers=h,
        )
        assert delay.status_code == 200
        assert delay.json()["total_hours"] >= delay.json()["base_transit_hours"]

from app.workflows.orchestrator import run_once


def test_workflow_recommendation_step():
    context = {
        "crop_id": 1,
        "crop_name": "Mango",
        "farmer_id": 1,
        "farmer_name": "Test Farmer",
        "island": "Jamaica",
        "quantity": 1500,
        "event": "surplus",
        "message": "High inventory detected",
        "market_context": "high demand at island ports",
        "weather_risk": "medium",
        "logistics_status": "constrained",
        "demand_signal": "surging",
    }

    result = run_once(context)
    assert result["status"] == "completed"
    # updates-mode payloads are keyed by node name: {"recommend": {...}}
    assert any(
        "recommend" in payload for payload in result["updates"] if isinstance(payload, dict)
    )
    assert result["input"]["event"] == "surplus"

    final_state = result["values"][-1]
    assert final_state["supply_risk"] == "surplus"
    assert final_state["decision"] == "allocate_surplus"
    assert final_state["recommendation"] is not None


def test_sho_api_key_is_used_when_minimax_is_missing(monkeypatch):
    from app.workflows import minimax_recommend

    class Settings:
        minimax_api_key = ""
        sho_api_key = "shogo-test-key"
        minimax_base_url = "https://example.test/v1"
        minimax_model = "model-x"
        sho_base_url = ""
        sho_model = ""
        cmdop_api_key = ""

    requests = []

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "Use the route"}}]}

    def fake_post(url, headers, json, timeout):
        requests.append({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return FakeResponse()

    monkeypatch.setattr(minimax_recommend, "get_settings", lambda: Settings())
    monkeypatch.setattr(minimax_recommend.httpx, "post", fake_post)

    result = minimax_recommend.recommend_supply_response({
        "crop_name": "Mango",
        "quantity": 1500,
        "farmer_name": "Test Farmer",
        "island": "Jamaica",
        "event": "surplus",
        "market_context": "high demand",
        "weather_risk": "medium",
        "logistics_status": "constrained",
        "demand_signal": "surging",
    })

    assert result["source"] == "shogo"
    assert requests[0]["headers"]["Authorization"] == "Bearer shogo-test-key"

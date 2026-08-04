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

"""Workflow control-flow tests: approval gate and disruption re-plan loop."""

from app.workflows.orchestrator import run_once


def _final_state(result: dict) -> dict:
    assert result["values"], "workflow produced no state snapshots"
    return result["values"][-1]


def test_approval_gate_holds_urgent_plans():
    result = run_once(
        {
            "crop_name": "Mango",
            "quantity": 20,  # shortage -> urgent plan
            "event": "shortage",
            "require_approval": True,
        }
    )
    assert result["status"] == "completed"
    state = _final_state(result)
    assert state["execution"]["status"] == "awaiting_approval"
    assert state["recovery"]["recovery_action"] == "await_human_approval"


def test_disruption_triggers_single_replan():
    result = run_once(
        {
            "crop_name": "Banana",
            "quantity": 1500,  # surplus
            "event": "surplus",
            "weather_risk": "high",  # disruption signal
        }
    )
    assert result["status"] == "completed"
    state = _final_state(result)
    # Monitor saw the disruption, re-planned once, then converged
    assert state["replan_count"] == 1
    assert state["recovery"]["replans_used"] == 1
    assert state["execution"]["status"] == "scheduled"


def test_normal_flow_executes_without_replan():
    result = run_once({"crop_name": "Yam", "quantity": 500})
    assert result["status"] == "completed"
    state = _final_state(result)
    assert state["decision"] == "monitor"
    assert state["replan_count"] == 0
    assert state["execution"]["status"] == "scheduled"
    assert result["thread_id"]

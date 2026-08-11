"""Workflow control-flow tests: approval gate and disruption re-plan loop."""

from app.workflows.orchestrator import resume_run, run_once


def _final_state(result: dict) -> dict:
    assert result["values"], "workflow produced no state snapshots"
    return result["values"][-1]


def test_approval_gate_pauses_and_resumes_on_decision():
    result = run_once(
        {
            "crop_name": "Mango",
            "quantity": 20,  # shortage -> urgent plan
            "event": "shortage",
            "require_approval": True,
        }
    )
    # A real interrupt() pause: the run stops before `hold` returns, so no
    # execution/recovery state exists yet — just the interrupt payload.
    assert result["status"] == "awaiting_approval"
    assert result["interrupt"]["execution"]["status"] == "awaiting_approval"

    resumed = resume_run(result["thread_id"], "approved")
    assert resumed["status"] == "completed"
    state = _final_state(resumed)
    assert state["execution"]["status"] == "approved"
    assert state["recovery"]["recovery_action"] == "activate_followup"


def test_approval_gate_rejection_short_circuits_recovery():
    result = run_once(
        {
            "crop_name": "Mango",
            "quantity": 20,
            "event": "shortage",
            "require_approval": True,
        }
    )
    assert result["status"] == "awaiting_approval"

    resumed = resume_run(result["thread_id"], "rejected")
    assert resumed["status"] == "completed"
    state = _final_state(resumed)
    assert state["execution"]["status"] == "rejected"
    assert state["recovery"]["recovery_action"] == "plan_rejected"


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

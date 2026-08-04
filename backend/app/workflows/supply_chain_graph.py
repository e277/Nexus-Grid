"""Core supply-chain workflow graph.

Implements the roadmap control loop as a stateful LangGraph:

    perceive → assess → recommend → plan → (approval gate) → execute
        → monitor → recover
                 ↘ assess (re-plan once when a disruption is detected)

State is a TypedDict so each node returns only the keys it updates and
LangGraph merges them into the shared state. The compiled graph uses an
in-memory checkpointer so each run's state history is inspectable and
resumable by thread id.
"""

import logging
import sqlite3
from pathlib import Path
from typing import Any, Optional, TypedDict

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, StateGraph

from app.config import get_settings
from app.services.supply_rules import classify_quantity, with_signal_defaults
from app.utils import utcnow_iso
from app.workflows.language_step import recommend_action

logger = logging.getLogger(__name__)

MAX_REPLANS = 1
RECOMMEND_ATTEMPTS = 3


class SupplyState(TypedDict, total=False):
    # Incoming signal context
    event: str
    crop_id: Optional[int]
    crop_name: str
    quantity: int
    farmer_id: Optional[int]
    farmer_name: str
    island: str
    harvest_date: Optional[str]
    message: Optional[str]
    market_context: str
    weather_risk: str
    logistics_status: str
    demand_signal: str
    require_approval: bool
    # Derived along the workflow
    phase: str
    supply_risk: str
    observed_at: str
    decision: str
    decision_rationale: str
    rationale: str
    recommendation: Any
    plan: dict
    execution: dict
    monitor: dict
    recovery: dict
    replan_count: int


def perceive(state: SupplyState) -> SupplyState:
    normalized = with_signal_defaults(state)
    return {
        "phase": "perceive",
        **normalized,
        "supply_risk": classify_quantity(normalized["quantity"]),
        "observed_at": utcnow_iso(),
        "replan_count": state.get("replan_count", 0),
    }


def assess(state: SupplyState) -> SupplyState:
    event = state.get("event", "inventory_checked")
    supply_risk = state.get("supply_risk", "normal")
    quantity = state.get("quantity", 0)
    decision = "monitor"
    if event == "surplus" or supply_risk == "surplus":
        decision = "allocate_surplus"
    elif event == "shortage" or supply_risk == "shortage":
        decision = "trigger_shortage_response"
    rationale = f"event={event}, quantity={quantity}, supply_risk={supply_risk}"
    return {
        "phase": "assess",
        "decision": decision,
        "decision_rationale": rationale,
        "rationale": rationale,
    }


def recommend(state: SupplyState) -> SupplyState:
    last_error: Exception | None = None
    for attempt in range(1, RECOMMEND_ATTEMPTS + 1):
        try:
            return recommend_action(state)
        except Exception as exc:  # retry transient LLM/tooling failures
            last_error = exc
            logger.warning("recommend attempt %d/%d failed: %s", attempt, RECOMMEND_ATTEMPTS, exc)
    return {
        "phase": "recommend",
        "recommendation": {
            "source": "error",
            "recommendation": "Recommendation unavailable after retries.",
            "error": str(last_error),
        },
    }


def plan(state: SupplyState) -> SupplyState:
    decision = state.get("decision", "monitor")
    if decision == "allocate_surplus":
        plan_data = {
            "action": "dispatch_surplus",
            "priority": "high",
            "target": "demand hub",
            "route": "cold-chain express",
            "logistics": {
                "mode": "truck",
                "temperature": "2-4°C",
            },
        }
    elif decision == "trigger_shortage_response":
        plan_data = {
            "action": "escalate_shortage",
            "priority": "urgent",
            "target": "operations team",
            "strategy": "reallocate stock and request emergency import",
            "notification": {
                "channel": "operations-alert",
                "severity": "high",
            },
        }
    else:
        plan_data = {
            "action": "monitor",
            "priority": "normal",
            "target": "supply dashboard",
            "instruction": "continue ingesting demand, weather, and logistics signals",
        }
    plan_data["recommendation"] = state.get("recommendation")
    return {"phase": "plan", "plan": plan_data}


def needs_approval(state: SupplyState) -> str:
    """Approval gate: urgent plans go to a human unless pre-approved."""
    plan_data = state.get("plan", {})
    if state.get("require_approval") and plan_data.get("priority") in {"high", "urgent"}:
        return "hold"
    return "execute"


def hold_for_approval(state: SupplyState) -> SupplyState:
    plan_data = state.get("plan", {})
    task = {
        "task": plan_data.get("action", "monitor"),
        "status": "awaiting_approval",
        "details": plan_data,
        "approval": {
            "required": True,
            "reason": f"priority={plan_data.get('priority')}",
        },
    }
    return {"phase": "hold", "execution": task}


def execute(state: SupplyState) -> SupplyState:
    plan_data = state.get("plan", {})
    task = {
        "task": plan_data.get("action", "monitor"),
        "status": "scheduled",
        "details": plan_data,
    }
    if task["task"] == "dispatch_surplus":
        task["eta"] = "24h"
    elif task["task"] == "escalate_shortage":
        task["escalation"] = "operations notified"
    return {"phase": "execute", "execution": task}


def monitor(state: SupplyState) -> SupplyState:
    """Watch execution for disruption signals that force a re-plan."""
    disruption = (
        state.get("weather_risk") in {"high", "severe"}
        or state.get("logistics_status") == "constrained"
    )
    can_replan = state.get("replan_count", 0) < MAX_REPLANS
    result = {
        "disruption_detected": disruption,
        "will_replan": disruption and can_replan,
        "checked_at": utcnow_iso(),
    }
    updates: SupplyState = {"phase": "monitor", "monitor": result}
    if result["will_replan"]:
        updates["replan_count"] = state.get("replan_count", 0) + 1
        # Downgrade the signal so the re-plan converges instead of looping
        updates["logistics_status"] = "replanned"
    return updates


def route_after_monitor(state: SupplyState) -> str:
    if state.get("monitor", {}).get("will_replan"):
        return "assess"
    return "recover"


def recover(state: SupplyState) -> SupplyState:
    decision = state.get("decision", "monitor")
    execution_status = state.get("execution", {}).get("status")
    recovery = {
        "recovery_action": "continue_monitoring" if decision == "monitor" else "activate_followup",
        "next_step": "observe_new_signals",
        "replans_used": state.get("replan_count", 0),
    }
    if execution_status == "awaiting_approval":
        recovery["recovery_action"] = "await_human_approval"
        recovery["next_step"] = "resume_on_approval"
    elif decision == "trigger_shortage_response":
        recovery["next_step"] = "notify_supply_chain_ops"
        recovery["feedback"] = "re-plan once updated demand and logistics signals arrive"
    return {"phase": "recover", "recovery": recovery}


workflow = StateGraph(SupplyState)
workflow.add_node("perceive", perceive)
workflow.add_node("assess", assess)
workflow.add_node("recommend", recommend)
workflow.add_node("plan", plan)
workflow.add_node("hold", hold_for_approval)
workflow.add_node("execute", execute)
workflow.add_node("monitor", monitor)
workflow.add_node("recover", recover)

workflow.set_entry_point("perceive")
workflow.add_edge("perceive", "assess")
workflow.add_edge("assess", "recommend")
workflow.add_edge("recommend", "plan")
workflow.add_conditional_edges("plan", needs_approval, {"execute": "execute", "hold": "hold"})
workflow.add_edge("hold", "recover")
workflow.add_edge("execute", "monitor")
workflow.add_conditional_edges(
    "monitor", route_after_monitor, {"assess": "assess", "recover": "recover"}
)
workflow.add_edge("recover", END)

_graph = None


def _build_checkpointer() -> BaseCheckpointSaver:
    """Create the checkpointer selected by settings.

    memory (default) — process-local, no setup; sqlite — durable local
    file; postgres — durable and shared across replicas (uses the app's
    DATABASE_URL via psycopg v3).
    """
    settings = get_settings()
    backend = settings.checkpointer_backend

    if backend == "sqlite":
        path = Path(settings.checkpointer_sqlite_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        from langgraph.checkpoint.sqlite import SqliteSaver

        conn = sqlite3.connect(str(path), check_same_thread=False)
        logger.info("Workflow checkpointer: sqlite at %s", path)
        return SqliteSaver(conn)

    if backend == "postgres":
        from langgraph.checkpoint.postgres import PostgresSaver
        from psycopg import Connection
        from psycopg.rows import dict_row

        conn = Connection.connect(
            settings.database_url, autocommit=True, prepare_threshold=0, row_factory=dict_row
        )
        saver = PostgresSaver(conn)
        saver.setup()
        logger.info("Workflow checkpointer: postgres")
        return saver

    logger.info("Workflow checkpointer: in-memory")
    return InMemorySaver()


def get_graph():
    """Compile the workflow once with the configured checkpointer."""
    global _graph
    if _graph is None:
        _graph = workflow.compile(checkpointer=_build_checkpointer())
    return _graph

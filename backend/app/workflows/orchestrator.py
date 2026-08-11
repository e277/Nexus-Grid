"""Entry points for running and resuming the supply-chain workflow graph."""

import logging
import uuid
from typing import Any

from langgraph.types import Command

from app.utils import utcnow_iso
from app.workflows.supply_chain_graph import get_graph

logger = logging.getLogger(__name__)


def _run(input_data: Any, thread_id: str) -> dict:
    """Stream the graph to completion or its next pause point.

    Shared by :func:`run_once` (fresh input) and :func:`resume_run` (a
    ``Command(resume=...)``) — both drive the same checkpointed thread, so
    a paused run's state carries over between the two.
    """
    config = {"configurable": {"thread_id": thread_id}}
    updates: list[dict] = []
    values: list[dict] = []
    started_at = utcnow_iso()
    status = "completed"
    interrupt_payload = None

    try:
        graph = get_graph()
        for chunk in graph.stream(input_data, config=config, stream_mode=["updates", "values"]):
            if isinstance(chunk, tuple) and len(chunk) == 2:
                mode, payload = chunk
                if mode == "updates":
                    if "__interrupt__" in payload:
                        # Surfaced explicitly below via get_state(), not as a raw node update
                        # (the raw Interrupt dataclass isn't a plain-JSON node payload).
                        continue
                    updates.append(payload)
                elif mode == "values":
                    values.append(payload)

        snapshot = graph.get_state(config)
        if snapshot.next:
            status = "awaiting_approval"
            if snapshot.interrupts:
                interrupt_payload = snapshot.interrupts[0].value
    except Exception as exc:
        logger.exception("Workflow execution failed")
        status = "failed"
        values.append({"error": str(exc)})

    finished_at = utcnow_iso()

    result: dict[str, Any] = {
        "status": status,
        "thread_id": thread_id,
        "started_at": started_at,
        "finished_at": finished_at,
        "updates": updates,
        "values": values,
    }
    if interrupt_payload is not None:
        result["interrupt"] = interrupt_payload
    return result


def run_once(context: dict | None = None, thread_id: str | None = None) -> dict:
    """Run the workflow once and collect its state transitions.

    Each run gets its own checkpointer thread id (unless one is supplied
    to resume a prior thread), so run history is inspectable via the
    graph's checkpointer. If the run reaches the approval gate, it stops
    there with ``status: "awaiting_approval"`` — see :func:`resume_run`.
    """
    input_data = context.copy() if context else {}
    thread_id = thread_id or uuid.uuid4().hex
    result = _run(input_data, thread_id)
    result["input"] = input_data
    return result


def resume_run(thread_id: str, decision: str) -> dict:
    """Continue a thread paused at the approval gate with a human decision.

    ``decision`` is delivered to the ``interrupt()`` call inside
    ``hold_for_approval`` (see ``supply_chain_graph.py``) — ``"approved"``
    or ``"rejected"``.
    """
    return _run(Command(resume=decision), thread_id)

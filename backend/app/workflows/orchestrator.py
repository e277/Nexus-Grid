"""Entry point for running the supply-chain workflow graph."""

import logging
import uuid

from app.utils import utcnow_iso
from app.workflows.supply_chain_graph import get_graph

logger = logging.getLogger(__name__)


def run_once(context: dict | None = None, thread_id: str | None = None) -> dict:
    """Run the workflow once and collect its state transitions.

    Each run gets its own checkpointer thread id (unless one is supplied
    to resume a prior thread), so run history is inspectable via the
    graph's checkpointer.
    """
    input_data = context.copy() if context else {}
    thread_id = thread_id or uuid.uuid4().hex
    config = {"configurable": {"thread_id": thread_id}}
    updates = []
    values = []
    started_at = utcnow_iso()
    status = "completed"

    try:
        graph = get_graph()
        for chunk in graph.stream(input_data, config=config, stream_mode=["updates", "values"]):
            if isinstance(chunk, tuple) and len(chunk) == 2:
                mode, payload = chunk
                if mode == "updates":
                    updates.append(payload)
                elif mode == "values":
                    values.append(payload)
    except Exception as exc:
        logger.exception("Workflow execution failed")
        status = "failed"
        values.append({"error": str(exc)})

    finished_at = utcnow_iso()

    return {
        "status": status,
        "thread_id": thread_id,
        "started_at": started_at,
        "finished_at": finished_at,
        "input": input_data,
        "updates": updates,
        "values": values,
    }

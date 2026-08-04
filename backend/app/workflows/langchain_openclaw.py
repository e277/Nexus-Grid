"""LLM recommendation step (LangChain) with optional OpenClaw runtime.

The recommendation itself is produced by a LangChain chat model. OpenClaw
is an *agent runtime* client (a themed wrapper over the cmdop SDK), not a
chat model — it is loaded through the compat shim in
``app.integrations.openclaw_compat`` and only constructed when
``CMDOP_API_KEY`` is configured. Until execution agents dispatch real
remote work, its role is availability reporting on the result payload.
"""

import logging
import os
from typing import Any

from app.config import get_settings
from app.integrations.openclaw_compat import load_openclaw
from app.services.supply_rules import with_signal_defaults

logger = logging.getLogger(__name__)

try:
    from langchain.chat_models import init_chat_model
    from langchain.messages import HumanMessage, SystemMessage
    _LANGCHAIN_AVAILABLE = True
except Exception as exc:
    _LANGCHAIN_AVAILABLE = False
    logger.warning("LangChain import failed: %s", exc)

PROMPT_TEXT = """
You are an autonomous Caribbean supply-chain assistant.
You receive crop, farmer, market, weather, demand, and logistics context.
Provide a single recommended action and a short rationale for how to respond.

Crop: {crop_name}
Quantity: {quantity}
Farmer: {farmer_name}
Island: {island}
Event: {event}
Market context: {market_context}
Weather risk: {weather_risk}
Logistics status: {logistics_status}
Demand signal: {demand_signal}
"""


def openclaw_runtime_status() -> str:
    """Report the OpenClaw runtime state: ready, unconfigured, or unavailable."""
    module = load_openclaw()
    if module is None:
        return "unavailable"
    if not get_settings().cmdop_api_key:
        return "unconfigured"
    return "ready"


def get_openclaw_client():
    """Return an OpenClaw client when the runtime is ready, else None.

    The client is async (``async with``) and spawns the cmdop core binary;
    callers own its lifecycle.
    """
    module = load_openclaw()
    api_key = get_settings().cmdop_api_key
    if module is None or not api_key:
        return None
    return module.OpenClaw(api_key=api_key)


def _build_messages(context: dict[str, Any]) -> list[Any]:
    filled = PROMPT_TEXT.format(**with_signal_defaults(context))
    return [
        SystemMessage(content="You are an autonomous Caribbean supply-chain assistant."),
        HumanMessage(content=filled),
    ]


def recommend_supply_response(context: dict[str, Any]) -> dict[str, Any]:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not _LANGCHAIN_AVAILABLE:
        return {
            "source": "stub",
            "recommendation": "LangChain is not available in this environment.",
            "notes": "Install langchain and langchain-openai, then set OPENAI_API_KEY.",
        }

    if not api_key:
        return {
            "source": "stub",
            "recommendation": "OpenAI API key is missing.",
            "notes": "Set OPENAI_API_KEY in environment or .env.",
        }

    messages = _build_messages(context)
    llm = init_chat_model(model="gpt-4o-mini", api_key=api_key, temperature=0.4)

    try:
        response = llm.invoke(messages)
        text = getattr(response, "content", None) or str(response)
        return {
            "source": "langchain",
            "recommendation": text,
            "openclaw_runtime": openclaw_runtime_status(),
        }
    except Exception as exc:
        logger.exception("LLM recommendation failed")
        return {
            "source": "error",
            "recommendation": "Failed to generate a recommendation.",
            "error": str(exc),
        }

"""LLM recommendation step (direct MiniMax call) with optional OpenClaw runtime.

MiniMax exposes an OpenAI-compatible chat completions endpoint, so the
recommendation step talks to it directly over HTTP via ``httpx``. OpenClaw is a separate *agent
runtime* client (a themed wrapper over the cmdop SDK), loaded through the
compat shim in ``app.integrations.openclaw_compat`` and only constructed
when ``CMDOP_API_KEY`` is configured. Until execution agents dispatch real
remote work, its role is availability reporting on the result payload.
"""

import logging
from typing import Any

import httpx

from app.config import get_settings
from app.integrations.openclaw_compat import load_openclaw
from app.services.supply_rules import with_signal_defaults

logger = logging.getLogger(__name__)

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


def _build_messages(context: dict[str, Any]) -> list[dict[str, str]]:
    filled = PROMPT_TEXT.format(**with_signal_defaults(context))
    return [
        {"role": "system", "content": "You are an autonomous Caribbean supply-chain assistant."},
        {"role": "user", "content": filled},
    ]


def _resolve_provider_config(settings: Any) -> tuple[str | None, str | None, str, str]:
    if settings.minimax_api_key:
        return settings.minimax_api_key, "minimax", settings.minimax_base_url, settings.minimax_model

    if settings.sho_api_key:
        base_url = settings.sho_base_url or settings.minimax_base_url
        model = settings.sho_model or settings.minimax_model
        return settings.sho_api_key, "shogo", base_url, model

    return None, None, settings.minimax_base_url, settings.minimax_model


def recommend_supply_response(context: dict[str, Any]) -> dict[str, Any]:
    settings = get_settings()
    api_key, provider_name, base_url, model = _resolve_provider_config(settings)
    if not api_key:
        return {
            "source": "stub",
            "recommendation": "No LLM API key is configured.",
            "notes": "Set MINIMAX_API_KEY or SHO_API_KEY in environment or .env.",
        }

    url = f"{base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": _build_messages(context),
        "temperature": 0.4,
    }

    try:
        response = httpx.post(
            url,
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
            timeout=30.0,
        )
        response.raise_for_status()
        text = response.json()["choices"][0]["message"]["content"]
        return {
            "source": provider_name or "minimax",
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

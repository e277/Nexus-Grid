import logging
from typing import Any

from app.services.supply_rules import with_signal_defaults
from app.workflows.langchain_openclaw import recommend_supply_response

logger = logging.getLogger(__name__)


def recommend_action(state: dict[str, Any]) -> dict[str, Any]:
    if state.get("event") not in {"surplus", "shortage"} and state.get("supply_risk") == "normal":
        return {
            "phase": "recommend",
            "recommendation": "No urgent action required. Continue monitoring supply signals.",
            "source": "rule",
        }

    response = recommend_supply_response(with_signal_defaults(state))

    return {
        "phase": "recommend",
        "recommendation": response,
    }

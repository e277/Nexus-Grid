"""Base class and result type shared by all Nexus-Grid agents.

Every agent exposes the contract required by the roadmap:

- **inputs** — an event payload dict plus a DB session
- **outputs** — a structured :class:`AgentResult`
- **memory** — a bounded deque of recent results per agent instance
- **logging** — standard logger per agent
- **confidence** — every result carries a 0..1 confidence score

Results are persisted as ``AgentActivity`` rows so operators can audit
what each agent did and why.
"""

import logging
from abc import ABC, abstractmethod
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from app.services import activity_service

MEMORY_SIZE = 50


@dataclass
class AgentResult:
    """Structured outcome of one agent invocation."""

    agent: str
    action: str
    confidence: float
    rationale: str
    outputs: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "agent": self.agent,
            "action": self.action,
            "confidence": self.confidence,
            "rationale": self.rationale,
            "outputs": self.outputs,
        }


class BaseAgent(ABC):
    """Template for agents: subclasses implement :meth:`handle`."""

    name: str = "base"

    def __init__(self) -> None:
        self.logger = logging.getLogger(f"app.agents.{self.name}")
        self.memory: deque[AgentResult] = deque(maxlen=MEMORY_SIZE)

    @abstractmethod
    def handle(self, db: Session, payload: dict[str, Any]) -> AgentResult:
        """Evaluate the payload and return a decision."""

    def run(self, db: Session, payload: dict[str, Any]) -> AgentResult:
        """Execute the agent: handle, remember, log, and persist the result."""
        result = self.handle(db, payload)
        self.memory.append(result)
        self.logger.info(
            "%s -> %s (confidence=%.2f): %s",
            self.name,
            result.action,
            result.confidence,
            result.rationale,
        )
        try:
            activity_service.record_agent_activity(
                db,
                agent_name=self.name,
                action=result.action,
                confidence=result.confidence,
                context={"payload": payload, "outputs": result.outputs},
            )
        except Exception:
            # Activity persistence must never break the decision path
            self.logger.exception("Failed to record agent activity")
        return result

    def recall(self, limit: int = 5) -> list[AgentResult]:
        """Return the most recent results from memory (newest first)."""
        return list(self.memory)[-limit:][::-1]

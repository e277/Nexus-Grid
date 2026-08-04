import asyncio
import logging

from fastapi import FastAPI

from app.config import get_settings
from app.database import SessionLocal

from .supply_agent import SupplyAgent

logger = logging.getLogger(__name__)
agent = SupplyAgent()


async def _agent_loop():
    # Periodic loop: query DB and run agent checks on the configured interval
    interval = get_settings().agent_poll_interval_seconds
    while True:
        try:
            db = SessionLocal()
            try:
                num = agent.run_check(db)
                logger.info("Agent run completed, %d events", num)
            finally:
                db.close()
            await asyncio.sleep(interval)
        except asyncio.CancelledError:
            break
        except Exception:
            logger.exception("Agent loop failed")


def start_agents(app: FastAPI):
    task = asyncio.create_task(_agent_loop())
    app.state.agent_task = task
    return task

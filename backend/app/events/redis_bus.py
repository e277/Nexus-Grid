"""Durable event bus backend on Redis Streams.

Publishing appends to the ``nexus:events`` stream; a consumer-group reader
(one asyncio task per process, started in the app lifespan) dispatches
entries to this process's local handlers and acknowledges them. The
consumer group gives at-least-once delivery, survives restarts, and load-
balances events across replicas.

Degraded mode: if Redis is unreachable at publish time, the event is
dispatched to local handlers directly (never both ways on success).
"""

import asyncio
import json
import logging
import os
import socket
from collections import defaultdict
from typing import Any

import redis
import redis.asyncio as aioredis

from app.events.bus import Handler

logger = logging.getLogger(__name__)

STREAM = "nexus:events"
GROUP = "nexus-workers"
BLOCK_MS = 1000
BATCH = 10


class RedisEventBus:
    def __init__(self, redis_url: str) -> None:
        self._url = redis_url
        self._sync = redis.Redis.from_url(redis_url, decode_responses=True)
        self._handlers: dict[str, list[Handler]] = defaultdict(list)
        self._consumer = f"{socket.gethostname()}-{os.getpid()}"
        self._task: asyncio.Task | None = None
        self._publish_error_logged = False

    def subscribe(self, event_name: str, handler: Handler) -> None:
        self._handlers[event_name].append(handler)

    def _dispatch_local(self, event_name: str, payload: dict[str, Any]) -> int:
        delivered = 0
        for handler in self._handlers.get(event_name, []):
            try:
                handler(event_name, payload)
                delivered += 1
            except Exception:
                logger.exception("Event handler failed for %s", event_name)
        return delivered

    def publish(self, event_name: str, payload: dict[str, Any] | None = None) -> int:
        payload = payload or {}
        try:
            self._sync.xadd(
                STREAM,
                {"event": event_name, "payload": json.dumps(payload, default=str)},
            )
            self._publish_error_logged = False
            return len(self._handlers.get(event_name, []))
        except Exception:
            if not self._publish_error_logged:
                logger.exception(
                    "Redis publish failed for %s; dispatching locally (degraded)", event_name
                )
                self._publish_error_logged = True
            return self._dispatch_local(event_name, payload)

    async def start(self) -> None:
        """Create the consumer group (idempotent) and start the reader task."""
        client = aioredis.Redis.from_url(self._url, decode_responses=True)
        try:
            await client.xgroup_create(STREAM, GROUP, id="$", mkstream=True)
        except aioredis.ResponseError as exc:
            if "BUSYGROUP" not in str(exc):
                raise
        self._task = asyncio.create_task(self._consume(client))
        logger.info("Redis event consumer %s started on %s", self._consumer, STREAM)

    async def _consume(self, client: aioredis.Redis) -> None:
        try:
            while True:
                try:
                    batches = await client.xreadgroup(
                        GROUP, self._consumer, {STREAM: ">"}, count=BATCH, block=BLOCK_MS
                    )
                except asyncio.CancelledError:
                    raise
                except Exception:
                    logger.exception("Event consumer read failed; retrying")
                    await asyncio.sleep(2)
                    continue

                for _stream, entries in batches or []:
                    for entry_id, fields in entries:
                        event_name = fields.get("event", "")
                        try:
                            payload = json.loads(fields.get("payload") or "{}")
                        except json.JSONDecodeError:
                            payload = {"raw": fields.get("payload")}
                        # Handlers are sync (they do DB work): keep the loop free
                        await asyncio.to_thread(self._dispatch_local, event_name, payload)
                        await client.xack(STREAM, GROUP, entry_id)
        except asyncio.CancelledError:
            pass
        finally:
            await client.aclose()

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        try:
            self._sync.close()
        except Exception:
            pass

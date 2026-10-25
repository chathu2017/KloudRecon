"""LISTEN org_events → in-process SSE subscribers.

A dedicated thread holds one psycopg connection in LISTEN mode and hands each notification to
the asyncio loop with `call_soon_threadsafe`. A thread (instead of an async connection) works on
every platform, including Windows' default Proactor event loop.
"""

from __future__ import annotations

import asyncio
import json
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import psycopg

from kloudrecon.core.logging import get_logger
from kloudrecon.services.events import CHANNEL

log = get_logger(__name__)


@dataclass(eq=False)
class Subscriber:
    org_id: uuid.UUID | None
    user_id: uuid.UUID
    queue: asyncio.Queue[dict[str, Any]] = field(default_factory=lambda: asyncio.Queue(maxsize=200))

    def wants(self, event: dict[str, Any]) -> bool:
        ev_user = event.get("user_id")
        ev_org = event.get("org_id")
        if ev_user:
            return bool(ev_user == str(self.user_id))
        return bool(ev_org is not None and self.org_id is not None and ev_org == str(self.org_id))


class EventHub:
    def __init__(self) -> None:
        self._subs: set[Subscriber] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.connected = False

    # --- subscribers (event loop side) ---
    def subscribe(self, org_id: uuid.UUID | None, user_id: uuid.UUID) -> Subscriber:
        sub = Subscriber(org_id=org_id, user_id=user_id)
        self._subs.add(sub)
        return sub

    def unsubscribe(self, sub: Subscriber) -> None:
        self._subs.discard(sub)

    def dispatch(self, event: dict[str, Any]) -> None:
        for sub in list(self._subs):
            if sub.wants(event):
                try:
                    sub.queue.put_nowait(event)
                except asyncio.QueueFull:
                    log.warning("sse_queue_full", user_id=str(sub.user_id))

    @property
    def subscriber_count(self) -> int:
        return len(self._subs)

    # --- listener thread ---
    def start(self, dsn: str) -> None:
        if self._thread is not None:
            return
        self._loop = asyncio.get_running_loop()
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, args=(dsn,), name="pg-listen", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5)
        self._thread = None

    def _run(self, dsn: str) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            try:
                with psycopg.connect(dsn, autocommit=True) as conn:
                    conn.execute(f"LISTEN {CHANNEL}")
                    self.connected = True
                    backoff = 1.0
                    log.info("event_listener_connected")
                    while not self._stop.is_set():
                        for note in conn.notifies(timeout=1.0, stop_after=50):
                            self._forward(note.payload)
            except Exception as exc:
                self.connected = False
                log.warning("event_listener_error", error=type(exc).__name__)
                time.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
        self.connected = False

    def _forward(self, raw: str) -> None:
        try:
            event = json.loads(raw)
        except json.JSONDecodeError:
            return
        if self._loop is not None and not self._loop.is_closed():
            self._loop.call_soon_threadsafe(self.dispatch, event)


hub = EventHub()

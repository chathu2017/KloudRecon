"""Worker entrypoint: `python -m kloudrecon.worker.main`.

- WORKER_CONCURRENCY asyncio tasks poll the PostgreSQL job queue; handlers run in threads.
- APScheduler runs the scheduler tick (guarded by an advisory lock) when RUN_SCHEDULER=true.
- A heartbeat every 60 s updates `worker_heartbeats` and emits the `worker_heartbeat` event with
  host metrics (used by Azure alerts and the owner console).
- SIGTERM/SIGINT: stop claiming, let running jobs finish (systemd TimeoutStopSec=60), exit.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import signal
import socket
import sys
import time
import uuid
from datetime import UTC, datetime
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import text

from kloudrecon import __version__
from kloudrecon.core.config import Settings, get_settings
from kloudrecon.core.db import session_scope
from kloudrecon.core.logging import configure_logging, get_logger
from kloudrecon.core.rls import enable_system
from kloudrecon.core.telemetry import setup_telemetry, track_event
from kloudrecon.jobs import queue
from kloudrecon.jobs.handlers import HANDLERS, JobContext
from kloudrecon.jobs.scheduler import tick
from kloudrecon.ops.sysinfo import host_stats
from kloudrecon.services.notifications import notify_platform_owners

log = get_logger("kloudrecon.worker")
SHUTDOWN_GRACE_SECONDS = 50


class Worker:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.hostname = socket.gethostname()
        self.worker_id = f"{self.hostname}:{os.getpid()}:{uuid.uuid4().hex[:6]}"
        self.started_at = datetime.now(UTC)
        self.stop = asyncio.Event()
        self.jobs_done = 0
        self.jobs_failed = 0
        self.running: set[uuid.UUID] = set()

    # ---- job loop -------------------------------------------------------------------------
    def _claim(self) -> queue.ClaimedJob | None:
        with session_scope() as session:
            enable_system(session)
            return queue.claim(session, self.worker_id)

    def _execute(self, job: queue.ClaimedJob) -> None:
        handler = HANDLERS.get(job.type)
        started = time.perf_counter()
        try:
            if handler is None:
                raise LookupError(f"no handler for job type {job.type!r}")
            handler(JobContext(job=job, worker_id=self.worker_id))
        except queue.JobDeferred as deferred:
            with session_scope() as session:
                enable_system(session)
                queue.defer(session, job, deferred.seconds, deferred.reason)
            log.info("job_deferred", job_id=str(job.id), type=job.type, reason=deferred.reason)
            return
        except Exception as exc:
            self.jobs_failed += 1
            error = f"{type(exc).__name__}: {exc}"
            with session_scope() as session:
                enable_system(session)
                status = queue.fail(session, job, error)
                if status == "dead":
                    notify_platform_owners(
                        session,
                        type="job.dead",
                        title=f"Job failed permanently: {job.type}",
                        body=error[:300],
                        link="/owner/health",
                    )
            log.warning(
                "job_failed",
                job_id=str(job.id),
                type=job.type,
                attempt=job.attempts,
                status=status,
                error=error[:500],
            )
            return
        with session_scope() as session:
            enable_system(session)
            queue.complete(session, job.id)
        self.jobs_done += 1
        log.info(
            "job_done",
            job_id=str(job.id),
            type=job.type,
            ms=round((time.perf_counter() - started) * 1000),
        )

    async def job_loop(self, slot: int) -> None:
        interval = self.settings.worker_poll_interval_seconds
        while not self.stop.is_set():
            try:
                job = await asyncio.to_thread(self._claim)
            except Exception as exc:
                log.warning("job_claim_error", slot=slot, error=type(exc).__name__)
                job = None
            if job is None:
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(self.stop.wait(), timeout=interval)
                continue
            self.running.add(job.id)
            try:
                await asyncio.to_thread(self._execute, job)
            finally:
                self.running.discard(job.id)

    # ---- heartbeat ------------------------------------------------------------------------
    def _heartbeat(self) -> dict[str, Any]:
        stats = host_stats()
        with session_scope() as session:
            enable_system(session)
            q = queue.queue_stats(session)
            stats.update(
                {
                    "version": __version__,
                    "jobs_queued": q.get("queued", 0),
                    "jobs_running": q.get("running", 0),
                    "jobs_dead": q.get("dead", 0),
                    "jobs_done": self.jobs_done,
                    "jobs_failed": self.jobs_failed,
                    "concurrency": self.settings.worker_concurrency,
                }
            )
            session.execute(
                text(
                    """
                    INSERT INTO worker_heartbeats
                        (worker_id, hostname, started_at, last_seen_at, stats)
                    VALUES (:id, :host, :started, now(), CAST(:stats AS jsonb))
                    ON CONFLICT (worker_id) DO UPDATE
                    SET last_seen_at = now(), stats = EXCLUDED.stats
                    """
                ),
                {
                    "id": self.worker_id,
                    "host": self.hostname,
                    "started": self.started_at,
                    "stats": _json(stats),
                },
            )
        track_event(
            "worker_heartbeat",
            {
                "worker_id": self.worker_id,
                "disk_free_percent": stats.get("disk_free_percent"),
                "mem_used_percent": stats.get("mem_used_percent"),
                "cpu_percent": stats.get("cpu_percent"),
                "jobs_queued": stats.get("jobs_queued"),
                "jobs_dead": stats.get("jobs_dead"),
            },
        )
        return stats

    async def heartbeat_loop(self) -> None:
        while not self.stop.is_set():
            try:
                await asyncio.to_thread(self._heartbeat)
            except Exception as exc:
                log.warning("heartbeat_error", error=type(exc).__name__)
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(
                    self.stop.wait(), timeout=self.settings.worker_heartbeat_seconds
                )

    def _remove_heartbeat(self) -> None:
        with session_scope() as session:
            enable_system(session)
            session.execute(
                text("DELETE FROM worker_heartbeats WHERE worker_id = :id"), {"id": self.worker_id}
            )

    # ---- scheduler ------------------------------------------------------------------------
    async def scheduler_tick(self) -> None:
        try:
            await asyncio.to_thread(tick)
        except Exception as exc:
            log.warning("scheduler_tick_error", error=type(exc).__name__)

    # ---- lifecycle ------------------------------------------------------------------------
    def request_stop(self, reason: str) -> None:
        if not self.stop.is_set():
            log.info("worker_stopping", reason=reason, running=len(self.running))
            self.stop.set()

    async def run(self) -> None:
        log.info(
            "worker_started",
            worker_id=self.worker_id,
            concurrency=self.settings.worker_concurrency,
            scheduler=self.settings.run_scheduler,
            version=__version__,
        )
        scheduler: AsyncIOScheduler | None = None
        if self.settings.run_scheduler:
            scheduler = AsyncIOScheduler(timezone="UTC")
            scheduler.add_job(
                self.scheduler_tick,
                "interval",
                seconds=self.settings.scheduler_interval_seconds,
                next_run_time=datetime.now(UTC),
                max_instances=1,
                coalesce=True,
                id="tick",
            )
            scheduler.start()

        tasks = [asyncio.create_task(self.heartbeat_loop(), name="heartbeat")]
        tasks += [
            asyncio.create_task(self.job_loop(i), name=f"jobs-{i}")
            for i in range(self.settings.worker_concurrency)
        ]
        await self.stop.wait()

        if scheduler is not None:
            scheduler.shutdown(wait=False)
        done, pending = await asyncio.wait(tasks, timeout=SHUTDOWN_GRACE_SECONDS)
        for task in pending:
            task.cancel()
        try:
            await asyncio.to_thread(self._remove_heartbeat)
        except Exception as exc:
            log.warning("heartbeat_cleanup_error", error=type(exc).__name__)
        log.info("worker_stopped", finished_tasks=len(done), cancelled=len(pending))


def _json(data: dict[str, Any]) -> str:
    import json

    return json.dumps(data, default=str)


def _install_signal_handlers(worker: Worker, loop: asyncio.AbstractEventLoop) -> None:
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, worker.request_stop, sig.name)
        except (NotImplementedError, RuntimeError):
            # Windows: no loop signal handlers; fall back to signal.signal.
            def _handler(signum: int, _frame: object, name: str = sig.name) -> None:
                loop.call_soon_threadsafe(worker.request_stop, name)

            signal.signal(sig, _handler)


async def _main() -> None:
    settings = get_settings()
    worker = Worker(settings)
    _install_signal_handlers(worker, asyncio.get_running_loop())
    await worker.run()


def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_format)
    setup_telemetry(settings, "kloudrecon-worker")
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(_main())
    sys.exit(0)


if __name__ == "__main__":
    main()

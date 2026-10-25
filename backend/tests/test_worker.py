from __future__ import annotations

import asyncio
import uuid

import psycopg
import pytest
from sqlalchemy import text

from kloudrecon.core.config import get_settings
from kloudrecon.core.db import session_scope
from kloudrecon.core.rls import system_context
from kloudrecon.jobs import queue
from kloudrecon.jobs.scheduler import SCHEDULER_LOCK_KEY, tick
from kloudrecon.notify.emails import TEMPLATES, render
from kloudrecon.services.infra import get_email_sender
from kloudrecon.services.infra.email import MemoryEmailSender
from kloudrecon.worker.main import Worker


def _sender() -> MemoryEmailSender:
    sender = get_email_sender()
    assert isinstance(sender, MemoryEmailSender)
    return sender


def _claim_and_run(worker: Worker) -> None:
    job = worker._claim()
    assert job is not None
    worker._execute(job)


def test_notify_email_job_sends_email() -> None:
    worker = Worker(get_settings())
    with session_scope() as s, system_context(s):
        queue.enqueue(
            s,
            "notify.email",
            {"to": ["a@b.test"], "template": "welcome", "context": {"name": "Ann"}},
        )
    _claim_and_run(worker)
    sent = _sender().sent
    assert len(sent) == 1
    assert sent[0].to == ["a@b.test"]
    assert "approved" in sent[0].subject.lower()
    with session_scope() as s, system_context(s):
        assert queue.queue_stats(s)["succeeded"] == 1


def test_failing_job_goes_dead_and_alerts_owners(
    admin_conn: psycopg.Connection[tuple[object, ...]],
) -> None:
    admin_conn.execute(
        "INSERT INTO users (external_oid, email, status, platform_role) "
        "VALUES ('dev:owner', 'owner@local.test', 'active', 'owner')"
    )
    worker = Worker(get_settings())
    with session_scope() as s, system_context(s):
        queue.enqueue(s, "does.not.exist", {}, max_attempts=1)
    _claim_and_run(worker)
    with session_scope() as s, system_context(s):
        assert queue.queue_stats(s)["dead"] == 1
    row = admin_conn.execute("SELECT type, title FROM notifications").fetchone()
    assert row is not None
    assert row[0] == "job.dead"


def test_heartbeat_records_worker_and_metrics() -> None:
    worker = Worker(get_settings())
    stats = worker._heartbeat()
    assert "cpu_percent" in stats
    assert "disk_free_percent" in stats
    with session_scope() as s, system_context(s):
        count = s.execute(text("SELECT count(*) FROM worker_heartbeats")).scalar_one()
    assert count == 1
    worker._remove_heartbeat()


def test_scheduler_tick_respects_advisory_lock(
    admin_conn: psycopg.Connection[tuple[object, ...]],
) -> None:
    assert tick() is True
    admin_conn.execute("BEGIN")
    try:
        admin_conn.execute("SELECT pg_advisory_xact_lock(%s)", (SCHEDULER_LOCK_KEY,))
        assert tick() is False
    finally:
        admin_conn.execute("ROLLBACK")


async def test_worker_run_stops_gracefully() -> None:
    settings = get_settings().model_copy(
        update={
            "worker_concurrency": 1,
            "run_scheduler": False,
            "worker_poll_interval_seconds": 0.1,
        }
    )
    worker = Worker(settings)
    with session_scope() as s, system_context(s):
        queue.enqueue(s, "notify.email", {"to": ["x@y.test"], "template": "invitation"})
    runner = asyncio.create_task(worker.run())
    for _ in range(50):
        await asyncio.sleep(0.1)
        if worker.jobs_done:
            break
    worker.request_stop("test")
    await asyncio.wait_for(runner, timeout=10)
    assert worker.jobs_done == 1


@pytest.mark.parametrize("name", sorted(TEMPLATES))
def test_every_template_renders_and_escapes(name: str) -> None:
    out = render(
        name, {"name": "<script>x</script>", "org_name": "Acme", "token": str(uuid.uuid4())}
    )
    assert out.subject
    assert "<script>x</script>" not in out.html
    assert "KloudRecon" in out.text


def test_unknown_template_raises() -> None:
    with pytest.raises(ValueError, match="unknown email template"):
        render("nope", {})

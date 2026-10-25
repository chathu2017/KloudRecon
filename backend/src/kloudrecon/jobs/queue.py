"""PostgreSQL job queue (plan Section 8.1).

Claiming uses `FOR UPDATE SKIP LOCKED`, so any number of workers can poll safely. Failed jobs
retry with exponential backoff + jitter and become `dead` after `max_attempts`.
Queue functions run in system context: callers pass a session where RLS allows the rows
(tenant context for the org's own jobs, or `system_context` for platform jobs and the worker).
"""

from __future__ import annotations

import random
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from kloudrecon.domain.models import Job, JobStatus

JOB_TYPES = (
    "scan.full",
    "scan.incremental",
    "ai.generate",
    "report.render",
    "notify.email",
    "notify.webhook",
    "ai.digest",
    "maintenance.cleanup",
    "maintenance.org_purge",
)


class JobDeferred(Exception):
    """Raised by a handler that cannot run right now (e.g. the connection is busy).

    The job goes back to the queue after `seconds` without counting as a failed attempt.
    """

    def __init__(self, seconds: float, reason: str) -> None:
        super().__init__(reason)
        self.seconds = seconds
        self.reason = reason


@dataclass(frozen=True)
class ClaimedJob:
    id: uuid.UUID
    org_id: uuid.UUID | None
    type: str
    payload: dict[str, Any]
    attempts: int
    max_attempts: int


def enqueue(
    session: Session,
    job_type: str,
    payload: dict[str, Any] | None = None,
    *,
    org_id: uuid.UUID | None = None,
    priority: int = 100,
    run_after: datetime | None = None,
    max_attempts: int = 5,
) -> uuid.UUID:
    job = Job(
        org_id=org_id,
        type=job_type,
        payload=payload or {},
        priority=priority,
        max_attempts=max_attempts,
    )
    if run_after is not None:
        job.run_after = run_after
    session.add(job)
    session.flush()
    return job.id


_CLAIM = text(
    """
    UPDATE jobs SET status = 'running', attempts = attempts + 1,
           locked_by = :worker, locked_at = now()
    WHERE id = (
        SELECT id FROM jobs
        WHERE status = 'queued' AND run_after <= now()
        ORDER BY priority, created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    RETURNING id, org_id, type, payload, attempts, max_attempts
    """
)


def claim(session: Session, worker_id: str) -> ClaimedJob | None:
    row = session.execute(_CLAIM, {"worker": worker_id}).mappings().first()
    if row is None:
        return None
    return ClaimedJob(
        id=row["id"],
        org_id=row["org_id"],
        type=row["type"],
        payload=dict(row["payload"] or {}),
        attempts=row["attempts"],
        max_attempts=row["max_attempts"],
    )


def complete(session: Session, job_id: uuid.UUID) -> None:
    session.execute(
        text(
            "UPDATE jobs SET status = 'succeeded', finished_at = now(), locked_by = NULL, "
            "last_error = NULL WHERE id = :id"
        ),
        {"id": job_id},
    )


def backoff_seconds(attempts: int) -> float:
    """Exponential backoff with jitter: ~10s, 20s, 40s ... capped at 1 hour."""
    base: float = min(3600.0, 10.0 * (2 ** max(0, attempts - 1)))
    return base * (0.8 + random.random() * 0.4)  # noqa: S311 - jitter, not crypto


def fail(session: Session, job: ClaimedJob, error: str) -> str:
    """Record a failure. Returns the new status (`queued` for retry, or `dead`)."""
    error = error[:4000]
    if job.attempts >= job.max_attempts:
        session.execute(
            text(
                "UPDATE jobs SET status = 'dead', finished_at = now(), locked_by = NULL, "
                "last_error = :err WHERE id = :id"
            ),
            {"id": job.id, "err": error},
        )
        return JobStatus.DEAD.value
    run_after = datetime.now(UTC) + timedelta(seconds=backoff_seconds(job.attempts))
    session.execute(
        text(
            "UPDATE jobs SET status = 'queued', run_after = :run_after, locked_by = NULL, "
            "locked_at = NULL, last_error = :err WHERE id = :id"
        ),
        {"id": job.id, "err": error, "run_after": run_after},
    )
    return JobStatus.QUEUED.value


def defer(session: Session, job: ClaimedJob, seconds: float, reason: str) -> None:
    """Put a claimed job back without using up an attempt."""
    session.execute(
        text(
            "UPDATE jobs SET status = 'queued', run_after = :run_after, attempts = attempts - 1, "
            "locked_by = NULL, locked_at = NULL, last_error = :reason WHERE id = :id"
        ),
        {
            "id": job.id,
            "reason": reason[:500],
            "run_after": datetime.now(UTC) + timedelta(seconds=seconds),
        },
    )


def requeue_stale(session: Session, *, older_than_minutes: int = 90) -> int:
    """Put jobs back in the queue when their worker died mid-run."""
    result = session.execute(
        text(
            "UPDATE jobs SET status = 'queued', locked_by = NULL, locked_at = NULL "
            "WHERE status = 'running' AND locked_at < now() - make_interval(mins => :mins)"
        ),
        {"mins": older_than_minutes},
    )
    return int(getattr(result, "rowcount", 0) or 0)


def retry_dead(session: Session, job_id: uuid.UUID) -> bool:
    result = session.execute(
        text(
            "UPDATE jobs SET status = 'queued', attempts = 0, run_after = now(), "
            "finished_at = NULL WHERE id = :id AND status = 'dead'"
        ),
        {"id": job_id},
    )
    return bool(getattr(result, "rowcount", 0))


def queue_stats(session: Session) -> dict[str, int]:
    rows = session.execute(text("SELECT status, count(*) FROM jobs GROUP BY status")).all()
    stats = {s.value: 0 for s in JobStatus}
    for status, count in rows:
        stats[str(status)] = int(count)
    return stats

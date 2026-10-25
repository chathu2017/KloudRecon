"""Job handlers, keyed by job type. Handlers are sync and run in a worker thread.

A handler raises to signal failure; the worker records it and retries with backoff.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy import text

from kloudrecon.core.db import session_scope
from kloudrecon.core.logging import get_logger
from kloudrecon.core.rls import enable_system
from kloudrecon.jobs.ai_jobs import handle_ai_digest, handle_ai_generate
from kloudrecon.jobs.queue import ClaimedJob, JobDeferred, requeue_stale
from kloudrecon.jobs.report_jobs import handle_report_render
from kloudrecon.services.infra import get_email_sender
from kloudrecon.services.infra.email import OutgoingEmail

log = get_logger(__name__)


@dataclass(frozen=True)
class JobContext:
    job: ClaimedJob
    worker_id: str


Handler = Callable[[JobContext], None]


def handle_notify_email(ctx: JobContext) -> None:
    payload = ctx.job.payload
    to = payload.get("to")
    template = payload.get("template")
    if not isinstance(to, list) or not to or not isinstance(template, str):
        raise ValueError("notify.email requires 'to' (list) and 'template'")
    context = dict(payload.get("context") or {})
    from kloudrecon.services import platform

    with session_scope() as session:
        enable_system(session)
        rendered = platform.render_email(session, template, context)
    message_id = get_email_sender().send(
        OutgoingEmail(
            to=[str(a) for a in to],
            subject=rendered.subject,
            html=rendered.html,
            text=rendered.text,
            tags={"template": template},
        )
    )
    log.info("email_sent", template=template, recipients=len(to), message_id=message_id)


def handle_notify_webhook(ctx: JobContext) -> None:
    """Deliver one alert to Teams/Slack/a signed webhook; the queue retries with backoff and the
    delivery is marked failed after the last attempt."""
    import uuid

    from kloudrecon.services import alerts

    delivery_id = uuid.UUID(str(ctx.job.payload["delivery_id"]))
    last = ctx.job.attempts >= ctx.job.max_attempts
    with session_scope() as session:
        enable_system(session)
        try:
            status = alerts.deliver_webhook(session, delivery_id).status
        except Exception as exc:  # e.g. the URL no longer validates
            log.warning("webhook_delivery_error", error=type(exc).__name__)
            status = "retrying"
        if status == "retrying" and last:
            alerts.mark_delivery_failed(session, delivery_id)
    if status == "retrying":
        raise RuntimeError("webhook delivery failed; will retry")


def handle_org_purge(ctx: JobContext) -> None:
    """Purge a deleted organization's files and rows (decision 0040)."""
    import uuid

    from kloudrecon.services import org_deletion

    with session_scope() as session:
        org_deletion.purge(session, uuid.UUID(str(ctx.job.payload["org_id"])))


def handle_scan(ctx: JobContext) -> None:
    """`scan.full`: run the scan pipeline. A crash on the last attempt marks the scan failed."""
    import uuid

    from kloudrecon.services.scan.pipeline import mark_failed, run_scan

    scan_id = uuid.UUID(str(ctx.job.payload["scan_id"]))
    try:
        run_scan(scan_id)
    except JobDeferred:
        raise
    except Exception as exc:
        if ctx.job.attempts >= ctx.job.max_attempts:
            mark_failed(scan_id, f"The scan stopped unexpectedly ({type(exc).__name__}).")
        raise


def handle_maintenance_cleanup(ctx: JobContext) -> None:
    run_maintenance()


def run_maintenance() -> dict[str, int]:
    """Retention and housekeeping. Safe to run repeatedly."""
    with session_scope() as session:
        enable_system(session)
        stale = requeue_stale(session)
        events = session.execute(
            text("DELETE FROM events WHERE created_at < now() - interval '30 days'")
        )
        jobs = session.execute(
            text(
                "DELETE FROM jobs WHERE status = 'succeeded' "
                "AND finished_at < now() - interval '14 days'"
            )
        )
        beats = session.execute(
            text("DELETE FROM worker_heartbeats WHERE last_seen_at < now() - interval '1 day'")
        )
        invites = session.execute(
            text(
                "DELETE FROM invitations WHERE accepted_at IS NULL "
                "AND expires_at < now() - interval '30 days'"
            )
        )
    result = {
        "requeued_stale_jobs": stale,
        "deleted_events": int(getattr(events, "rowcount", 0) or 0),
        "deleted_jobs": int(getattr(jobs, "rowcount", 0) or 0),
        "deleted_heartbeats": int(getattr(beats, "rowcount", 0) or 0),
        "deleted_invitations": int(getattr(invites, "rowcount", 0) or 0),
    }
    log.info("maintenance_done", **result)
    return result


HANDLERS: dict[str, Handler] = {
    "notify.email": handle_notify_email,
    "notify.webhook": handle_notify_webhook,
    "maintenance.cleanup": handle_maintenance_cleanup,
    "maintenance.org_purge": handle_org_purge,
    "scan.full": handle_scan,
    "scan.incremental": handle_scan,
    "ai.generate": handle_ai_generate,
    "ai.digest": handle_ai_digest,
    "report.render": handle_report_render,
}

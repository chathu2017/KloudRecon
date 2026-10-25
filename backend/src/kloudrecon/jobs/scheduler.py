"""Scheduler tick. APScheduler (in the worker) calls `tick()` every few minutes.

Only one worker process runs a tick at a time: the tick holds a transaction-level advisory lock
(`pg_try_advisory_xact_lock`). Others skip that round.
"""

from __future__ import annotations

from sqlalchemy import text

from kloudrecon.core.db import session_scope
from kloudrecon.core.logging import get_logger
from kloudrecon.core.rls import enable_system
from kloudrecon.jobs.handlers import run_maintenance
from kloudrecon.services import schedule

log = get_logger(__name__)

# "KR" + 1: arbitrary, stable 64-bit key for the scheduler lock.
SCHEDULER_LOCK_KEY = 0x4B52_0000_0001


def tick() -> bool:
    """Run scheduled work if this process wins the lock. Returns True when it ran."""
    with session_scope() as session:
        enable_system(session)
        got: bool = session.execute(
            text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": SCHEDULER_LOCK_KEY}
        ).scalar_one()
        if not got:
            log.debug("scheduler_tick_skipped")
            return False
        # Daily scans, secret expiry reminders, scan retention, cost partitions, housekeeping.
        queued = schedule.schedule_daily_scans(session)
        schedule.schedule_weekly_digests(session)
        from kloudrecon.services import billing, reports

        reports.run_due_schedules(session)
        billing.check_trials(session)
        reminders = schedule.send_secret_reminders(session)
        removed = schedule.apply_scan_retention(session)
        schedule.maintain_cost_partitions(session)
        run_maintenance()
        log.info(
            "scheduler_tick_done", scans_queued=queued, reminders=reminders, scans_removed=removed
        )
        return True

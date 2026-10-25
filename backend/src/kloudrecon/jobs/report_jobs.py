"""`report.render`: build the report HTML, render the PDF (Playwright), store it, notify."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from kloudrecon.core.db import session_scope
from kloudrecon.core.logging import get_logger
from kloudrecon.core.rls import set_tenant

if TYPE_CHECKING:
    from kloudrecon.jobs.handlers import JobContext

log = get_logger(__name__)


def handle_report_render(ctx: JobContext) -> None:
    from kloudrecon.services import reports

    report_id = uuid.UUID(str(ctx.job.payload["report_id"]))
    org_id = uuid.UUID(str(ctx.job.payload.get("org_id") or ctx.job.org_id))
    try:
        with session_scope() as s:
            set_tenant(s, org_id)
            report = reports.render(s, report_id)
            log.info(
                "report_rendered", type=report.type, pages=report.pages, bytes=report.size_bytes
            )
    except Exception as exc:
        if ctx.job.attempts >= ctx.job.max_attempts:
            with session_scope() as s:
                set_tenant(s, org_id)
                reports.mark_failed(
                    s, report_id, f"The report could not be generated ({type(exc).__name__})."
                )
        raise

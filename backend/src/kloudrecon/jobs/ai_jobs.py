"""AI jobs: `ai.generate` (one generation) and `ai.digest` (weekly digest + email)."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import select

from kloudrecon.core.db import session_scope
from kloudrecon.core.logging import get_logger
from kloudrecon.core.rls import set_tenant, system_context
from kloudrecon.domain.models import Organization, OrgStatus, User, UserStatus

if TYPE_CHECKING:
    from kloudrecon.jobs.handlers import JobContext

log = get_logger(__name__)


def _uuid(value: Any) -> uuid.UUID | None:
    return uuid.UUID(str(value)) if value else None


def handle_ai_generate(ctx: JobContext) -> None:
    from kloudrecon.ai import service as ai

    p = ctx.job.payload
    org_id = _uuid(p.get("org_id")) or ctx.job.org_id
    if org_id is None:
        raise ValueError("ai.generate needs an org_id")
    with session_scope() as s:
        set_tenant(s, org_id)
        row = ai.generate(
            s,
            org_id,
            str(p["kind"]),
            scan_id=_uuid(p.get("scan_id")),
            view=p.get("view"),
            finding_id=_uuid(p.get("finding_id")),
            user_id=_uuid(p.get("user_id")),
            counted=bool(p.get("counted")),
            force=bool(p.get("force")),
        )
        log.info("ai_generated", kind=row.kind, source=row.source, tokens=row.tokens_out)


def digest_recipients(session: Any, org_id: uuid.UUID) -> list[str]:
    with system_context(session):
        users = session.scalars(
            select(User).where(User.org_id == org_id, User.status == UserStatus.ACTIVE.value)
        ).all()
    return [
        u.email
        for u in users
        if (u.notification_prefs or {}).get("weekly_digest", True) is not False
    ]


def handle_ai_digest(ctx: JobContext) -> None:
    """Generate this week's digest for one org and email it (not counted against the quota)."""
    from kloudrecon.ai import service as ai
    from kloudrecon.services.notifications import send_email

    org_id = _uuid(ctx.job.payload.get("org_id")) or ctx.job.org_id
    if org_id is None:
        raise ValueError("ai.digest needs an org_id")
    with session_scope() as s:
        set_tenant(s, org_id)
        org = s.get(Organization, org_id)
        if org is None or org.status != OrgStatus.ACTIVE.value:
            return
        row = ai.generate(s, org_id, "weekly_digest")
        to = digest_recipients(s, org_id)
        if not to or not row.content:
            return
        send_email(
            s,
            to=to,
            template="weekly_digest",
            context={"org_name": org.name, "digest": row.content, "refs": row.refs},
            org_id=org_id,
        )
        log.info("ai_digest_sent", recipients=len(to), source=row.source)

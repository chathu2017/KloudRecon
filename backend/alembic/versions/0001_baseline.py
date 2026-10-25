"""Baseline: plans, organizations, users, invitations, audit, notifications, events, jobs, heartbeats.

Also creates Row-Level Security policies (FORCE RLS) and grants DML to kloudrecon_app.

Revision ID: 0001
Revises:
Create Date: 2026-09-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = pg.UUID(as_uuid=True)
JSONB = pg.JSONB()
TS = sa.DateTime(timezone=True)


def _id() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"))


def _created() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False)


def _updated() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False)


def _jsonb(name: str) -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(name, JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False)


ORG = "org_id = NULLIF(current_setting('app.org_id', true), '')::uuid"
USER = "user_id = NULLIF(current_setting('app.user_id', true), '')::uuid"
SELF = "id = NULLIF(current_setting('app.org_id', true), '')::uuid"
SYSTEM = "current_setting('app.system', true) = 'on'"

POLICIES = {
    "organizations": f"{SELF} OR {SYSTEM}",
    "users": f"{ORG} OR {SYSTEM}",
    "invitations": f"{ORG} OR {SYSTEM}",
    "audit_logs": f"{ORG} OR {SYSTEM}",
    "jobs": f"{ORG} OR {SYSTEM}",
    "notifications": f"{USER} OR {SYSTEM}",
    "events": f"{ORG} OR {USER} OR {SYSTEM}",
}


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.create_table(
        "plans",
        _id(),
        sa.Column("code", sa.String(40), nullable=False, unique=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("description", sa.Text, server_default="", nullable=False),
        sa.Column("price_monthly", sa.Numeric(10, 2), nullable=True),
        sa.Column("currency", sa.String(3), server_default="USD", nullable=False),
        _jsonb("limits"),
        _jsonb("features"),
        sa.Column("active", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("sort_order", sa.Integer, server_default=sa.text("0"), nullable=False),
        _created(),
        _updated(),
    )

    op.create_table(
        "organizations",
        _id(),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("country", sa.String(80)),
        sa.Column("size", sa.String(40)),
        sa.Column("industry", sa.String(80)),
        sa.Column("use_case", sa.Text),
        sa.Column("status", sa.String(32), server_default="pending_approval", nullable=False),
        sa.Column("plan_id", UUID, sa.ForeignKey("plans.id")),
        sa.Column("trial_ends_at", TS),
        sa.Column("approved_at", TS),
        sa.Column("approved_by", UUID),
        sa.Column("rejection_reason", sa.Text),
        sa.Column("owner_notes", sa.Text),
        _jsonb("branding"),
        _jsonb("settings"),
        _created(),
        _updated(),
    )
    op.create_index("ix_organizations_status", "organizations", ["status"])

    op.create_table(
        "users",
        _id(),
        sa.Column("org_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE")),
        sa.Column("external_oid", sa.String(200), nullable=False, unique=True),
        sa.Column("issuer", sa.String(300), server_default="", nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("name", sa.String(200), server_default="", nullable=False),
        sa.Column("job_title", sa.String(120)),
        sa.Column("phone", sa.String(40)),
        sa.Column("org_role", sa.String(20)),
        sa.Column("platform_role", sa.String(20)),
        sa.Column("status", sa.String(32), server_default="pending_approval", nullable=False),
        sa.Column("approved_by", UUID),
        sa.Column("approved_at", TS),
        sa.Column("rejection_reason", sa.Text),
        sa.Column("terms_accepted_at", TS),
        sa.Column("last_login_at", TS),
        _jsonb("notification_prefs"),
        _created(),
        _updated(),
    )
    op.create_index("ix_users_org_id", "users", ["org_id"])
    op.create_index("ix_users_status", "users", ["status"])
    op.create_index("uq_users_email_lower", "users", [sa.text("lower(email)")], unique=True)

    op.create_table(
        "invitations",
        _id(),
        sa.Column(
            "org_id",
            UUID,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("invited_by", UUID),
        sa.Column("expires_at", TS, nullable=False),
        sa.Column("accepted_at", TS),
        sa.Column("accepted_by", UUID),
        sa.Column("revoked_at", TS),
        _created(),
    )
    op.create_index("ix_invitations_org_id", "invitations", ["org_id"])

    op.create_table(
        "audit_logs",
        _id(),
        sa.Column("org_id", UUID),
        sa.Column("actor_id", UUID),
        sa.Column("actor_email", sa.String(320)),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("target", sa.String(300)),
        sa.Column("ip", sa.String(64)),
        sa.Column("user_agent", sa.String(400)),
        _jsonb("details"),
        _created(),
    )
    op.create_index("ix_audit_logs_org_id", "audit_logs", ["org_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    op.create_table(
        "notifications",
        _id(),
        sa.Column("org_id", UUID),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(80), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text, server_default="", nullable=False),
        sa.Column("link", sa.String(500)),
        sa.Column("read_at", TS),
        _created(),
    )
    op.create_index("ix_notifications_org_id", "notifications", ["org_id"])
    op.create_index("ix_notifications_user_created", "notifications", ["user_id", "created_at"])

    op.create_table(
        "events",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("org_id", UUID),
        sa.Column("user_id", UUID),
        sa.Column("type", sa.String(80), nullable=False),
        _jsonb("payload"),
        _created(),
    )
    op.create_index("ix_events_org_id", "events", ["org_id"])
    op.create_index("ix_events_created_at", "events", ["created_at"])

    op.create_table(
        "jobs",
        _id(),
        sa.Column("org_id", UUID),
        sa.Column("type", sa.String(80), nullable=False),
        _jsonb("payload"),
        sa.Column("status", sa.String(20), server_default="queued", nullable=False),
        sa.Column("priority", sa.Integer, server_default=sa.text("100"), nullable=False),
        sa.Column("run_after", TS, server_default=sa.func.now(), nullable=False),
        sa.Column("attempts", sa.Integer, server_default=sa.text("0"), nullable=False),
        sa.Column("max_attempts", sa.Integer, server_default=sa.text("5"), nullable=False),
        sa.Column("locked_by", sa.String(200)),
        sa.Column("locked_at", TS),
        sa.Column("last_error", sa.Text),
        _created(),
        sa.Column("finished_at", TS),
    )
    op.create_index(
        "ix_jobs_queue",
        "jobs",
        ["priority", "created_at"],
        postgresql_where=sa.text("status = 'queued'"),
    )
    op.create_index("ix_jobs_status", "jobs", ["status"])

    op.create_table(
        "worker_heartbeats",
        sa.Column("worker_id", sa.String(200), primary_key=True),
        sa.Column("hostname", sa.String(200), nullable=False),
        sa.Column("started_at", TS, nullable=False),
        sa.Column("last_seen_at", TS, nullable=False),
        _jsonb("stats"),
    )

    for table, expr in POLICIES.items():
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(f"CREATE POLICY tenant_isolation ON {table} USING ({expr}) WITH CHECK ({expr})")

    # Grants for the application role (exists locally, in CI tests and in production).
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kloudrecon_app') THEN
            GRANT USAGE ON SCHEMA public TO kloudrecon_app;
            GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kloudrecon_app;
            GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kloudrecon_app;
            REVOKE ALL ON TABLE alembic_version FROM kloudrecon_app;
          END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    for table in reversed(list(POLICIES)):
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
    for table in (
        "worker_heartbeats",
        "jobs",
        "events",
        "notifications",
        "audit_logs",
        "invitations",
        "users",
        "organizations",
        "plans",
    ):
        op.drop_table(table)

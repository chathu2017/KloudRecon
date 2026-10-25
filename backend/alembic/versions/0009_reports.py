"""Reports (Phase 5 step 4): generated PDF reports and their schedules.

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = pg.UUID(as_uuid=True)
JSONB = pg.JSONB()
TS = sa.DateTime(timezone=True)

ORG = "org_id = NULLIF(current_setting('app.org_id', true), '')::uuid"
SYSTEM = "current_setting('app.system', true) = 'on'"
POLICY = f"{ORG} OR {SYSTEM}"
TABLES = ("report_schedules", "reports")


def _id() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"))


def _org() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(
        "org_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )


def upgrade() -> None:
    op.create_table(
        "report_schedules",
        _id(),
        _org(),
        sa.Column("type", sa.String(30), nullable=False),
        sa.Column("params", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("frequency", sa.String(10), nullable=False),
        sa.Column("weekday", sa.Integer, server_default=sa.text("0"), nullable=False),
        sa.Column("day_of_month", sa.Integer, server_default=sa.text("1"), nullable=False),
        sa.Column("hour_utc", sa.Integer, server_default=sa.text("6"), nullable=False),
        sa.Column("recipients", JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("enabled", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("next_run_at", TS, nullable=False),
        sa.Column("last_run_at", TS),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_report_schedules_org_id", "report_schedules", ["org_id"])
    op.create_index("ix_report_schedules_due", "report_schedules", ["enabled", "next_run_at"])

    op.create_table(
        "reports",
        _id(),
        _org(),
        sa.Column("scan_id", UUID, sa.ForeignKey("scans.id", ondelete="SET NULL")),
        sa.Column("type", sa.String(30), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("params", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("status", sa.String(20), server_default="queued", nullable=False),
        sa.Column("blob_path", sa.Text),
        sa.Column("size_bytes", sa.Integer),
        sa.Column("pages", sa.Integer),
        sa.Column("error", sa.Text),
        sa.Column("requested_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("schedule_id", UUID, sa.ForeignKey("report_schedules.id", ondelete="SET NULL")),
        sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", TS),
    )
    op.create_index("ix_reports_org_id", "reports", ["org_id"])
    op.create_index("ix_reports_org_created", "reports", ["org_id", "created_at"])

    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} USING ({POLICY}) WITH CHECK ({POLICY})"
        )
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kloudrecon_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON reports, report_schedules TO kloudrecon_app;
          END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS reports CASCADE")
    op.execute("DROP TABLE IF EXISTS report_schedules CASCADE")

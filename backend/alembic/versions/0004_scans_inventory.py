"""Scans, stage logs, per-scan inventory snapshots, edges, changes and RBAC (Phase 2, steps 3-4).

Every scan keeps its own copy of the inventory (`resources`, `resource_groups`, `resource_edges`,
`rbac_assignments`), which is what the time machine and "compare scans" read. Changes keep the
connection even when an old scan is removed by retention (`scan_id` SET NULL).

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = pg.UUID(as_uuid=True)
JSONB = pg.JSONB()
TS = sa.DateTime(timezone=True)

ORG = "org_id = NULLIF(current_setting('app.org_id', true), '')::uuid"
SYSTEM = "current_setting('app.system', true) = 'on'"
TABLES = (
    "scans",
    "scan_stage_logs",
    "resources",
    "resource_groups",
    "resource_edges",
    "resource_changes",
    "rbac_assignments",
)


def _id() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"))


def _org() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(
        "org_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )


def _scan() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("scan_id", UUID, sa.ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)


def _jsonb(name: str) -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(name, JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False)


def _created() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False)


def upgrade() -> None:
    op.create_table(
        "scans",
        _id(),
        _org(),
        sa.Column(
            "connection_id",
            UUID,
            sa.ForeignKey("connections.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sequence", sa.Integer, server_default=sa.text("1"), nullable=False),
        sa.Column("trigger", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), server_default="queued", nullable=False),
        sa.Column("stage", sa.String(40)),
        sa.Column("progress", sa.Integer, server_default=sa.text("0"), nullable=False),
        sa.Column("requested_by", UUID),
        sa.Column("job_id", UUID),
        sa.Column("started_at", TS),
        sa.Column("finished_at", TS),
        _jsonb("stats"),
        sa.Column("error", JSONB),
        _created(),
    )
    op.create_index("ix_scans_org_id", "scans", ["org_id"])
    op.create_index("ix_scans_org_created", "scans", ["org_id", "created_at"])
    op.create_index("ix_scans_connection_created", "scans", ["connection_id", "created_at"])

    op.create_table(
        "scan_stage_logs",
        _id(),
        _org(),
        _scan(),
        sa.Column("stage", sa.String(40), nullable=False),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("optional", sa.Boolean, server_default=sa.text("false"), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("started_at", TS),
        sa.Column("finished_at", TS),
        sa.Column("items", sa.Integer),
        sa.Column("message", sa.Text),
        sa.UniqueConstraint("scan_id", "stage", name="uq_scan_stage_logs_scan_stage"),
    )
    op.create_index("ix_scan_stage_logs_org_id", "scan_stage_logs", ["org_id"])

    op.create_table(
        "resources",
        _id(),
        _org(),
        _scan(),
        sa.Column("connection_id", UUID, nullable=False),
        sa.Column("arm_id", sa.Text, nullable=False),
        sa.Column("name", sa.String(300), nullable=False),
        sa.Column("type", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(100)),
        sa.Column("location", sa.String(64)),
        sa.Column("resource_group", sa.String(200)),
        sa.Column("subscription_id", sa.String(64)),
        sa.Column("sku", JSONB),
        _jsonb("tags"),
        _jsonb("properties"),
        sa.Column("identity", JSONB),
        sa.Column("managed_by", sa.Text),
        sa.Column("zones", JSONB),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("monthly_cost", sa.Numeric(14, 4)),
        sa.Column("risk_level", sa.String(20)),
        _created(),
        sa.UniqueConstraint("scan_id", "arm_id", name="uq_resources_scan_arm"),
    )
    op.create_index("ix_resources_org_id", "resources", ["org_id"])
    op.create_index("ix_resources_scan_type", "resources", ["scan_id", "type"])
    op.create_index("ix_resources_scan_name", "resources", ["scan_id", "name"])

    op.create_table(
        "resource_groups",
        _id(),
        _org(),
        _scan(),
        sa.Column("arm_id", sa.Text, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("location", sa.String(64)),
        sa.Column("subscription_id", sa.String(64)),
        _jsonb("tags"),
    )
    op.create_index("ix_resource_groups_org_id", "resource_groups", ["org_id"])
    op.create_index("ix_resource_groups_scan", "resource_groups", ["scan_id"])

    op.create_table(
        "resource_edges",
        _id(),
        _org(),
        _scan(),
        sa.Column("source_arm_id", sa.Text, nullable=False),
        sa.Column("target_arm_id", sa.Text, nullable=False),
        sa.Column("edge_type", sa.String(40), nullable=False),
        _jsonb("attrs"),
    )
    op.create_index("ix_resource_edges_org_id", "resource_edges", ["org_id"])
    op.create_index("ix_resource_edges_scan_source", "resource_edges", ["scan_id", "source_arm_id"])
    op.create_index("ix_resource_edges_scan_target", "resource_edges", ["scan_id", "target_arm_id"])

    op.create_table(
        "resource_changes",
        _id(),
        _org(),
        sa.Column(
            "connection_id",
            UUID,
            sa.ForeignKey("connections.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("scan_id", UUID, sa.ForeignKey("scans.id", ondelete="SET NULL")),
        sa.Column("arm_id", sa.Text, nullable=False),
        sa.Column("resource_name", sa.String(300), server_default="", nullable=False),
        sa.Column("resource_type", sa.String(200)),
        sa.Column("resource_group", sa.String(200)),
        sa.Column("subscription_id", sa.String(64)),
        sa.Column("change_type", sa.String(20), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("operation", sa.String(300)),
        _jsonb("diff"),
        sa.Column("caller", sa.String(320)),
        sa.Column("caller_type", sa.String(20)),
        sa.Column("occurred_at", TS, nullable=False),
        sa.Column("risky", sa.Boolean, server_default=sa.text("false"), nullable=False),
        sa.Column("risk_reason", sa.String(300)),
        sa.Column("event_id", sa.String(100)),
        _created(),
    )
    op.create_index("ix_resource_changes_org_id", "resource_changes", ["org_id"])
    op.create_index(
        "ix_resource_changes_org_occurred", "resource_changes", ["org_id", "occurred_at"]
    )
    op.create_index("ix_resource_changes_arm", "resource_changes", ["connection_id", "arm_id"])
    op.create_index(
        "uq_resource_changes_event",
        "resource_changes",
        ["connection_id", "event_id"],
        unique=True,
        postgresql_where=sa.text("event_id IS NOT NULL"),
    )

    op.create_table(
        "rbac_assignments",
        _id(),
        _org(),
        _scan(),
        sa.Column("assignment_id", sa.Text, nullable=False),
        sa.Column("principal_id", sa.String(64), nullable=False),
        sa.Column("principal_type", sa.String(40)),
        sa.Column("principal_name", sa.String(300)),
        sa.Column("role_name", sa.String(200), nullable=False),
        sa.Column("role_def_id", sa.String(64), nullable=False),
        sa.Column("scope", sa.Text, nullable=False),
        sa.Column("subscription_id", sa.String(64)),
        sa.Column("is_privileged", sa.Boolean, server_default=sa.text("false"), nullable=False),
        sa.Column("is_custom", sa.Boolean, server_default=sa.text("false"), nullable=False),
    )
    op.create_index("ix_rbac_assignments_org_id", "rbac_assignments", ["org_id"])
    op.create_index("ix_rbac_assignments_scan", "rbac_assignments", ["scan_id"])

    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        expr = f"{ORG} OR {SYSTEM}"
        op.execute(f"CREATE POLICY tenant_isolation ON {table} USING ({expr}) WITH CHECK ({expr})")
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kloudrecon_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kloudrecon_app;
            GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kloudrecon_app;
            REVOKE ALL ON TABLE alembic_version FROM kloudrecon_app;
          END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    for table in reversed(TABLES):
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.drop_table(table)

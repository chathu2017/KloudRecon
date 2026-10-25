"""Azure connections, subscriptions and management groups (Phase 2, steps 1-2).

The connection keeps only the Key Vault secret NAME and the expiry date; the secret value lives in
the SecretStore. All three tables are tenant tables with FORCE ROW LEVEL SECURITY.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = pg.UUID(as_uuid=True)
JSONB = pg.JSONB()
TS = sa.DateTime(timezone=True)

ORG = "org_id = NULLIF(current_setting('app.org_id', true), '')::uuid"
SYSTEM = "current_setting('app.system', true) = 'on'"
TABLES = ("connections", "azure_subscriptions", "management_groups")


def _id() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"))


def _org() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(
        "org_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )


def _jsonb(name: str, default: str = "'{}'::jsonb") -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(name, JSONB, server_default=sa.text(default), nullable=False)


def _ts(name: str) -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(name, TS, server_default=sa.func.now(), nullable=False)


def upgrade() -> None:
    op.create_table(
        "connections",
        _id(),
        _org(),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("tenant_id", sa.String(255), nullable=False),
        sa.Column("client_id", sa.String(64), nullable=False),
        sa.Column("kv_secret_name", sa.String(127)),
        sa.Column("secret_expires_on", sa.Date),
        sa.Column("secret_updated_at", TS),
        _jsonb("tiers", """'{"core": true}'::jsonb"""),
        _jsonb("scope", """'{"type": "all"}'::jsonb"""),
        sa.Column("status", sa.String(32), server_default="pending", nullable=False),
        _jsonb("validation_report"),
        sa.Column("validated_at", TS),
        sa.Column("is_demo", sa.Boolean, server_default=sa.text("false"), nullable=False),
        _jsonb("settings"),
        sa.Column("last_scan_id", UUID),
        sa.Column("last_scan_at", TS),
        sa.Column("last_scan_status", sa.String(20)),
        sa.Column("last_manual_scan_at", TS),
        sa.Column("created_by", UUID),
        _ts("created_at"),
        _ts("updated_at"),
        sa.UniqueConstraint("org_id", "name", name="uq_connections_org_name"),
    )
    op.create_index("ix_connections_org_id", "connections", ["org_id"])

    op.create_table(
        "azure_subscriptions",
        _id(),
        _org(),
        sa.Column(
            "connection_id",
            UUID,
            sa.ForeignKey("connections.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("subscription_id", sa.String(64), nullable=False),
        sa.Column("name", sa.String(200), server_default="", nullable=False),
        sa.Column("state", sa.String(32), server_default="Enabled", nullable=False),
        sa.Column("tenant_id", sa.String(64)),
        sa.Column("enabled", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("is_production", sa.Boolean, server_default=sa.text("false"), nullable=False),
        sa.Column("cost_available", sa.Boolean),
        _jsonb("access"),
        sa.Column("disabled_reason", sa.String(200)),
        sa.Column("last_seen_at", TS),
        _ts("created_at"),
        _ts("updated_at"),
        sa.UniqueConstraint(
            "connection_id", "subscription_id", name="uq_azure_subscriptions_conn_sub"
        ),
    )
    op.create_index("ix_azure_subscriptions_org_id", "azure_subscriptions", ["org_id"])

    op.create_table(
        "management_groups",
        _id(),
        _org(),
        sa.Column(
            "connection_id",
            UUID,
            sa.ForeignKey("connections.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("mg_id", sa.String(200), nullable=False),
        sa.Column("name", sa.String(200), server_default="", nullable=False),
        sa.Column("parent_id", sa.String(200)),
        _ts("created_at"),
        sa.UniqueConstraint("connection_id", "mg_id", name="uq_management_groups_conn_mg"),
    )
    op.create_index("ix_management_groups_org_id", "management_groups", ["org_id"])

    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        expr = f"{ORG} OR {SYSTEM}"
        op.execute(f"CREATE POLICY tenant_isolation ON {table} USING ({expr}) WITH CHECK ({expr})")
    _grant()


def _grant() -> None:
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

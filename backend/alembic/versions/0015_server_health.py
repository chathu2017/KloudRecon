"""Server health checks (decision 0054): servers registered by name and the health checks built
from the script output a customer pastes in.

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = pg.UUID(as_uuid=True)
JSONB = pg.JSONB()
TS = sa.DateTime(timezone=True)

ORG = "org_id = NULLIF(current_setting('app.org_id', true), '')::uuid"
SYSTEM = "current_setting('app.system', true) = 'on'"
POLICY = f"{ORG} OR {SYSTEM}"
TABLES = ("servers", "server_checks")


def _id() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"))


def _org() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(
        "org_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )


def _created() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False)


def upgrade() -> None:
    op.create_table(
        "servers",
        _id(),
        _org(),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("platform", sa.String(10), nullable=False),
        sa.Column("os_family", sa.String(30), nullable=False),
        sa.Column("os_version", sa.String(20), nullable=False),
        sa.Column("notes", sa.Text, server_default="", nullable=False),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        _created(),
        sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("org_id", "platform", "name", name="uq_servers_org_platform_name"),
    )
    op.create_index("ix_servers_org_id", "servers", ["org_id"])

    op.create_table(
        "server_checks",
        _id(),
        _org(),
        sa.Column(
            "server_id", UUID, sa.ForeignKey("servers.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("collected_at", TS),
        sa.Column("score", sa.Integer, nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("summary", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("raw", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        _created(),
    )
    op.create_index("ix_server_checks_org_id", "server_checks", ["org_id"])
    op.create_index("ix_server_checks_server_created", "server_checks", ["server_id", "created_at"])

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
            GRANT SELECT, INSERT, UPDATE, DELETE ON servers, server_checks TO kloudrecon_app;
          END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    for table in ("server_checks", "servers"):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")

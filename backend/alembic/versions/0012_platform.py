"""Owner console (Phase 5 step 7): announcements, feature flags and email template overrides.
Platform tables (no RLS, like plans and retirement_catalog): written only by the platform owner.

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = pg.UUID(as_uuid=True)
JSONB = pg.JSONB()
TS = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "announcements",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("body", sa.Text, server_default="", nullable=False),
        sa.Column("level", sa.String(20), server_default="info", nullable=False),
        sa.Column("link", sa.String(300)),
        sa.Column("starts_at", TS),
        sa.Column("ends_at", TS),
        sa.Column("active", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "feature_flags",
        sa.Column("key", sa.String(60), primary_key=True),
        sa.Column("description", sa.String(300), server_default="", nullable=False),
        sa.Column("enabled", sa.Boolean, server_default=sa.text("false"), nullable=False),
        # when not empty, the flag is on only for these organizations
        sa.Column("org_ids", JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "email_templates",
        sa.Column("key", sa.String(60), primary_key=True),
        sa.Column("subject", sa.String(200)),
        sa.Column("intro", sa.Text),
        sa.Column("updated_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False),
    )
    op.execute(
        """
        INSERT INTO feature_flags (key, description, enabled) VALUES
          ('ai_chat', 'Ask KloudRecon chat for customers', true),
          ('public_demo', 'Show the "View live demo" entry on the public site', true)
        ON CONFLICT (key) DO NOTHING
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kloudrecon_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON announcements, feature_flags, email_templates
              TO kloudrecon_app;
          END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    for table in ("email_templates", "feature_flags", "announcements"):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")

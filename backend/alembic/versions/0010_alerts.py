"""Alerts & integrations (Phase 5 step 5): alert rules, channels (Teams, Slack, signed
webhook) and the delivery log. Webhook URLs and signing secrets live in the SecretStore.

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = pg.UUID(as_uuid=True)
JSONB = pg.JSONB()
TS = sa.DateTime(timezone=True)

ORG = "org_id = NULLIF(current_setting('app.org_id', true), '')::uuid"
SYSTEM = "current_setting('app.system', true) = 'on'"
POLICY = f"{ORG} OR {SYSTEM}"
TABLES = ("integrations", "alert_rules", "alert_deliveries")


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
        "integrations",
        _id(),
        _org(),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("secret_name", sa.String(127), nullable=False),
        sa.Column("url_hint", sa.String(200), server_default="", nullable=False),
        sa.Column("enabled", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("last_status", sa.String(20)),
        sa.Column("last_delivery_at", TS),
        sa.Column("last_error", sa.Text),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        _created(),
        sa.UniqueConstraint("org_id", "name", name="uq_integrations_org_name"),
    )
    op.create_index("ix_integrations_org_id", "integrations", ["org_id"])

    op.create_table(
        "alert_rules",
        _id(),
        _org(),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("config", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("channels", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("enabled", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        _created(),
        sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_alert_rules_org_id", "alert_rules", ["org_id"])
    op.create_index("ix_alert_rules_org_event", "alert_rules", ["org_id", "event_type"])

    op.create_table(
        "alert_deliveries",
        _id(),
        _org(),
        sa.Column("rule_id", UUID, sa.ForeignKey("alert_rules.id", ondelete="SET NULL")),
        sa.Column("integration_id", UUID, sa.ForeignKey("integrations.id", ondelete="SET NULL")),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("dedupe_key", sa.String(200)),
        sa.Column("title", sa.String(300), server_default="", nullable=False),
        sa.Column("status", sa.String(20), server_default="queued", nullable=False),
        sa.Column("attempts", sa.Integer, server_default=sa.text("0"), nullable=False),
        sa.Column("response_code", sa.Integer),
        sa.Column("error", sa.Text),
        sa.Column("payload", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        _created(),
        sa.Column("sent_at", TS),
    )
    op.create_index("ix_alert_deliveries_org_id", "alert_deliveries", ["org_id"])
    op.create_index("ix_alert_deliveries_org_created", "alert_deliveries", ["org_id", "created_at"])
    op.create_index(
        "ix_alert_deliveries_dedupe", "alert_deliveries", ["org_id", "rule_id", "dedupe_key"]
    )

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
            GRANT SELECT, INSERT, UPDATE, DELETE ON integrations, alert_rules, alert_deliveries
              TO kloudrecon_app;
          END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    for table in ("alert_deliveries", "alert_rules", "integrations"):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")

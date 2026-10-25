"""Billing (Phase 5 step 6): billing accounts per org, plan change history (owner metrics),
provider webhook events (idempotency) and provider price IDs on plans.

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = pg.UUID(as_uuid=True)
JSONB = pg.JSONB()
TS = sa.DateTime(timezone=True)

ORG = "org_id = NULLIF(current_setting('app.org_id', true), '')::uuid"
SYSTEM = "current_setting('app.system', true) = 'on'"
POLICY = f"{ORG} OR {SYSTEM}"
TENANT_TABLES = ("billing_accounts", "plan_changes", "billing_events")


def _org() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(
        "org_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )


def upgrade() -> None:
    op.add_column(
        "plans",
        sa.Column("provider_prices", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
    )
    op.create_table(
        "billing_accounts",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        _org(),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("customer_id", sa.String(200)),
        sa.Column("subscription_id", sa.String(200)),
        sa.Column("status", sa.String(20), server_default="none", nullable=False),
        sa.Column("period_end", TS),
        sa.Column("past_due_since", TS),
        sa.Column("canceled_at", TS),
        sa.Column("last_event_at", TS),
        sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("org_id", name="uq_billing_accounts_org"),
    )
    op.create_index("ix_billing_accounts_org_id", "billing_accounts", ["org_id"])
    op.create_index("ix_billing_accounts_customer", "billing_accounts", ["provider", "customer_id"])
    op.create_table(
        "plan_changes",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        _org(),
        sa.Column("from_code", sa.String(40)),
        sa.Column("to_code", sa.String(40)),
        sa.Column("from_price", sa.Numeric(10, 2)),
        sa.Column("to_price", sa.Numeric(10, 2)),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("reason", sa.String(200)),
        sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_plan_changes_org_id", "plan_changes", ["org_id"])
    op.create_index("ix_plan_changes_org_created", "plan_changes", ["org_id", "created_at"])
    op.create_index("ix_plan_changes_created", "plan_changes", ["created_at"])
    # Provider events: written only by the webhook endpoint in an explicit system path. RLS like
    # every table with org_id (rows without an org are visible to system paths only).
    op.create_table(
        "billing_events",
        sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("event_id", sa.String(200), nullable=False),
        sa.Column("type", sa.String(100), nullable=False),
        sa.Column("org_id", UUID, sa.ForeignKey("organizations.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(20), server_default="processed", nullable=False),
        sa.Column("summary", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("received_at", TS, server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("provider", "event_id", name="uq_billing_events_provider_event"),
    )

    for table in TENANT_TABLES:
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
            GRANT SELECT, INSERT, UPDATE, DELETE ON billing_accounts, plan_changes, billing_events
              TO kloudrecon_app;
          END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    for table in ("billing_events", "plan_changes", "billing_accounts"):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
    op.drop_column("plans", "provider_prices")

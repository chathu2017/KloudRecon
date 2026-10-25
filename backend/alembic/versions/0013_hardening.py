"""Hardening (Phase 5 step 8): one alert rule name per organization, so concurrent first loads
cannot create the default rules twice (they are inserted with ON CONFLICT DO NOTHING).

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-30
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # keep the oldest rule of any duplicated name (the defaults could race before this)
    op.execute(
        """
        DELETE FROM alert_rules r USING alert_rules o
        WHERE r.org_id = o.org_id AND r.name = o.name
          AND (r.created_at, r.id) > (o.created_at, o.id)
        """
    )
    op.create_unique_constraint("uq_alert_rules_org_name", "alert_rules", ["org_id", "name"])


def downgrade() -> None:
    op.drop_constraint("uq_alert_rules_org_name", "alert_rules", type_="unique")

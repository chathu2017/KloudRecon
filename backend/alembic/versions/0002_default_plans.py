"""Default plans (plan Section 18), so production has plans to approve with.

Idempotent: existing plan codes are left untouched (the owner may have edited them).

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-26
"""

import json
from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Snapshot of plan Section 18 defaults at the time of this migration (do not import app code).
PLANS: list[dict[str, Any]] = [
    {
        "code": "trial",
        "name": "Trial",
        "description": "Free for 14 days. Explore every core feature on one connection.",
        "price_monthly": "0",
        "sort_order": 0,
        "limits": {
            "connections": 1,
            "subscriptions": 3,
            "scans_per_day": 3,
            "ai_messages": 50,
            "frameworks": 1,
            "trial_days": 14,
        },
        "features": {"reports_watermark": True},
    },
    {
        "code": "starter",
        "name": "Starter",
        "description": "For small teams running one Azure environment.",
        "price_monthly": "10",
        "sort_order": 1,
        "limits": {
            "connections": 1,
            "subscriptions": 5,
            "scans_per_day": 1,
            "ai_messages": 200,
            "frameworks": 1,
        },
        "features": {"all_reports": True},
    },
    {
        "code": "pro",
        "name": "Pro",
        "description": "For consultants and growing cloud teams.",
        "price_monthly": "49",
        "sort_order": 2,
        "limits": {
            "connections": 5,
            "subscriptions": 50,
            "scans_per_day": 4,
            "ai_messages": 1000,
            "frameworks": None,
        },
        "features": {
            "all_reports": True,
            "custom_rules": True,
            "white_label": True,
            "scheduled_reports": True,
            "webhooks": True,
        },
    },
    {
        "code": "enterprise",
        "name": "Enterprise",
        "description": "Unlimited scale, consultant multi-tenant, SSO (roadmap) and SLA.",
        "price_monthly": None,
        "sort_order": 3,
        "limits": {
            "connections": None,
            "subscriptions": None,
            "scans_per_day": None,
            "ai_messages": None,
            "frameworks": None,
        },
        "features": {
            "all_reports": True,
            "custom_rules": True,
            "white_label": True,
            "scheduled_reports": True,
            "webhooks": True,
            "multi_tenant": True,
            "sla": True,
        },
    },
]


def upgrade() -> None:
    stmt = sa.text(
        """
        INSERT INTO plans (code, name, description, price_monthly, currency, limits, features,
                           active, sort_order)
        VALUES (:code, :name, :description, CAST(:price AS numeric), 'USD', CAST(:limits AS jsonb),
                CAST(:features AS jsonb), true, :sort_order)
        ON CONFLICT (code) DO NOTHING
        """
    )
    for plan in PLANS:
        op.execute(
            stmt.bindparams(
                code=plan["code"],
                name=plan["name"],
                description=plan["description"],
                price=plan["price_monthly"],
                limits=json.dumps(plan["limits"]),
                features=json.dumps(plan["features"]),
                sort_order=plan["sort_order"],
            )
        )


def downgrade() -> None:
    # Plans may be referenced by organizations; never delete them automatically.
    pass

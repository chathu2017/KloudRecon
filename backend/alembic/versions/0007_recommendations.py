"""Recommendations hub (Phase 5 step 1).

- recommendation_states: workflow (status, assignee, due date) of recommendations that are not
  findings (rightsizing, waste, commitments). Findings keep their own workflow columns.
- recommendation_comments: comments on those recommendations.

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = pg.UUID(as_uuid=True)
TS = sa.DateTime(timezone=True)

ORG = "org_id = NULLIF(current_setting('app.org_id', true), '')::uuid"
SYSTEM = "current_setting('app.system', true) = 'on'"
POLICY = f"{ORG} OR {SYSTEM}"
TABLES = ("recommendation_states", "recommendation_comments")


def _id() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"))


def _org() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(
        "org_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )


def upgrade() -> None:
    op.create_table(
        "recommendation_states",
        _id(),
        _org(),
        sa.Column("ref", sa.String(80), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("title", sa.String(300), server_default="", nullable=False),
        sa.Column("status", sa.String(20), server_default="open", nullable=False),
        sa.Column("assignee_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("due_at", TS),
        sa.Column("updated_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("org_id", "ref", name="uq_recommendation_states_org_ref"),
    )
    op.create_index("ix_recommendation_states_org_id", "recommendation_states", ["org_id"])

    op.create_table(
        "recommendation_comments",
        _id(),
        _org(),
        sa.Column("ref", sa.String(80), nullable=False),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("kind", sa.String(20), server_default="comment", nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_recommendation_comments_org_id", "recommendation_comments", ["org_id"])
    op.create_index(
        "ix_recommendation_comments_org_ref", "recommendation_comments", ["org_id", "ref"]
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
            GRANT SELECT, INSERT, UPDATE, DELETE ON recommendation_states, recommendation_comments
              TO kloudrecon_app;
          END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    for table in reversed(TABLES):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")

"""AI layer (Phase 5 steps 2-3): generations, usage log and chat.

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = pg.UUID(as_uuid=True)
JSONB = pg.JSONB()
TS = sa.DateTime(timezone=True)

ORG = "org_id = NULLIF(current_setting('app.org_id', true), '')::uuid"
SYSTEM = "current_setting('app.system', true) = 'on'"
POLICY = f"{ORG} OR {SYSTEM}"
TABLES = ("ai_generations", "ai_usage", "chat_sessions", "chat_messages")


def _id() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"))


def _org() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(
        "org_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )


def _int(name: str) -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(name, sa.Integer, server_default=sa.text("0"), nullable=False)


def _created() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False)


def upgrade() -> None:
    op.create_table(
        "ai_generations",
        _id(),
        _org(),
        sa.Column("scan_id", UUID, sa.ForeignKey("scans.id", ondelete="CASCADE")),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("subject", sa.String(300), nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("source", sa.String(20)),
        sa.Column("prompt_version", sa.String(60)),
        sa.Column("model", sa.String(120)),
        sa.Column("input_hash", sa.String(64)),
        _int("tokens_in"),
        _int("tokens_out"),
        sa.Column("cost_usd", sa.Numeric(12, 6), server_default=sa.text("0"), nullable=False),
        sa.Column("content", JSONB),
        sa.Column("refs", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("notice", sa.Text),
        sa.Column("error", sa.Text),
        sa.Column("requested_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        _created(),
        sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("org_id", "kind", "subject", name="uq_ai_generations_org_kind_subject"),
    )
    op.create_index("ix_ai_generations_org_id", "ai_generations", ["org_id"])

    op.create_table(
        "ai_usage",
        _id(),
        _org(),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("model", sa.String(120), server_default="", nullable=False),
        _int("tokens_in"),
        _int("tokens_out"),
        sa.Column("cost_usd", sa.Numeric(12, 6), server_default=sa.text("0"), nullable=False),
        sa.Column("counted", sa.Boolean, server_default=sa.text("false"), nullable=False),
        sa.Column("ok", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("error_code", sa.String(40)),
        _int("latency_ms"),
        _created(),
    )
    op.create_index("ix_ai_usage_org_id", "ai_usage", ["org_id"])
    op.create_index("ix_ai_usage_org_created", "ai_usage", ["org_id", "created_at"])

    op.create_table(
        "chat_sessions",
        _id(),
        _org(),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), server_default="New chat", nullable=False),
        _created(),
        sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_chat_sessions_org_id", "chat_sessions", ["org_id"])
    op.create_index("ix_chat_sessions_user", "chat_sessions", ["org_id", "user_id", "updated_at"])

    op.create_table(
        "chat_messages",
        _id(),
        _org(),
        sa.Column(
            "session_id",
            UUID,
            sa.ForeignKey("chat_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, server_default="", nullable=False),
        sa.Column("tool_calls", JSONB, server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("citations", JSONB, server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("model", sa.String(120)),
        _int("tokens_in"),
        _int("tokens_out"),
        _created(),
    )
    op.create_index("ix_chat_messages_org_id", "chat_messages", ["org_id"])
    op.create_index("ix_chat_messages_session", "chat_messages", ["session_id", "created_at"])

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
            GRANT SELECT, INSERT, UPDATE, DELETE ON ai_generations, ai_usage, chat_sessions,
              chat_messages TO kloudrecon_app;
          END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    for table in reversed(TABLES):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")

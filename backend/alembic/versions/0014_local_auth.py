"""Local sign-in (AUTH_MODE=local, decision 0047): one-time email codes and owner passwords.

Both tables are platform tables (no org_id, no RLS): a sign-in happens before any tenant is
known. They hold no secrets in clear text: codes are HMAC digests, passwords scrypt hashes.

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "auth_challenges",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("name", sa.String(200), server_default="", nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("attempts", sa.Integer, server_default="0", nullable=False),
        sa.Column("sends", sa.Integer, server_default="1", nullable=False),
        sa.Column("ip", sa.String(64)),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_auth_challenges_email_created", "auth_challenges", ["email", "created_at"])
    op.create_index("ix_auth_challenges_ip_created", "auth_challenges", ["ip", "created_at"])
    op.create_table(
        "local_credentials",
        sa.Column("email", sa.String(320), primary_key=True),
        sa.Column("password_hash", sa.String(300), nullable=False),
        sa.Column("failed_attempts", sa.Integer, server_default="0", nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True)),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kloudrecon_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON auth_challenges, local_credentials
              TO kloudrecon_app;
          END IF;
        END
        $$;
        """
    )


def downgrade() -> None:
    op.drop_table("local_credentials")
    op.drop_table("auth_challenges")

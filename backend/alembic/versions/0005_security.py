"""Security, compliance, reliability and governance data (Phase 3).

- scan_artifacts: raw/normalized imports per scan (Defender, Advisor, Policy, configuration,
  Entra ID, quotas, rule summary) so every page can show "as of" any scan.
- findings: one row per issue (connection + rule + resource) carrying the workflow state
  across scans; finding_occurrences records which scans saw it (time machine, trends).
- finding_exceptions / finding_comments: workflow.
- vulnerabilities, security_alerts, exposures, attack_paths, compliance_results, scores,
  identities_entra: per-scan security results.
- custom_rules: customer KQL checks. retirement_catalog: platform table (no RLS).

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = pg.UUID(as_uuid=True)
JSONB = pg.JSONB()
TS = sa.DateTime(timezone=True)

ORG = "org_id = NULLIF(current_setting('app.org_id', true), '')::uuid"
SYSTEM = "current_setting('app.system', true) = 'on'"
TABLES = (
    "scan_artifacts",
    "findings",
    "finding_occurrences",
    "finding_exceptions",
    "finding_comments",
    "vulnerabilities",
    "security_alerts",
    "exposures",
    "attack_paths",
    "compliance_results",
    "scores",
    "identities_entra",
    "custom_rules",
)


def _id() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"))


def _org() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(
        "org_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )


def _scan() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("scan_id", UUID, sa.ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)


def _jsonb(name: str, default: str = "'{}'::jsonb") -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(name, JSONB, server_default=sa.text(default), nullable=False)


def _created() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False)


def _updated() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False)


def _resource_cols() -> list[sa.Column]:  # type: ignore[type-arg]
    return [
        sa.Column("arm_id", sa.Text, nullable=False),
        sa.Column("resource_name", sa.String(300), server_default="", nullable=False),
        sa.Column("resource_type", sa.String(200)),
    ]


def upgrade() -> None:
    op.create_table(
        "scan_artifacts",
        _id(),
        _org(),
        _scan(),
        sa.Column("kind", sa.String(40), nullable=False),
        _jsonb("data"),
        _created(),
        sa.UniqueConstraint("scan_id", "kind", name="uq_scan_artifacts_scan_kind"),
    )
    op.create_index("ix_scan_artifacts_org_id", "scan_artifacts", ["org_id"])

    op.create_table(
        "findings",
        _id(),
        _org(),
        sa.Column(
            "connection_id",
            UUID,
            sa.ForeignKey("connections.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rule_id", sa.String(160), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("category", sa.String(80), server_default="", nullable=False),
        sa.Column("area", sa.String(40)),
        sa.Column("pillar", sa.String(20), nullable=False),
        sa.Column("severity", sa.String(10), nullable=False),
        sa.Column("risk_score", sa.Integer, server_default=sa.text("0"), nullable=False),
        *_resource_cols(),
        sa.Column("resource_group", sa.String(200)),
        sa.Column("subscription_id", sa.String(64)),
        sa.Column("location", sa.String(64)),
        sa.Column("title", sa.String(300), nullable=False),
        _jsonb("evidence"),
        _jsonb("risk_factors"),
        sa.Column("est_monthly_savings", sa.Numeric(14, 2)),
        sa.Column("effort", sa.String(10)),
        sa.Column("status", sa.String(20), server_default="open", nullable=False),
        sa.Column("status_reason", sa.Text),
        sa.Column("assignee_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("due_at", TS),
        sa.Column("first_seen", TS, nullable=False),
        sa.Column("last_seen", TS, nullable=False),
        sa.Column("resolved_at", TS),
        sa.Column("first_scan_id", UUID),
        sa.Column("last_scan_id", UUID),
        sa.Column("reopened_count", sa.Integer, server_default=sa.text("0"), nullable=False),
        sa.Column("exception_id", UUID),
        _created(),
        _updated(),
        sa.UniqueConstraint("connection_id", "rule_id", "arm_id", name="uq_findings_conn_rule_arm"),
    )
    op.create_index("ix_findings_org_id", "findings", ["org_id"])
    op.create_index("ix_findings_org_status", "findings", ["org_id", "status"])
    op.create_index("ix_findings_org_arm", "findings", ["org_id", "arm_id"])
    op.create_index("ix_findings_last_scan", "findings", ["last_scan_id"])

    op.create_table(
        "finding_occurrences",
        _id(),
        _org(),
        _scan(),
        sa.Column(
            "finding_id", UUID, sa.ForeignKey("findings.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("severity", sa.String(10), nullable=False),
        sa.Column("risk_score", sa.Integer, server_default=sa.text("0"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        _jsonb("evidence"),
        sa.UniqueConstraint("scan_id", "finding_id", name="uq_finding_occurrences_scan_finding"),
    )
    op.create_index("ix_finding_occurrences_org_id", "finding_occurrences", ["org_id"])
    op.create_index("ix_finding_occurrences_finding", "finding_occurrences", ["finding_id"])

    op.create_table(
        "finding_exceptions",
        _id(),
        _org(),
        sa.Column("finding_id", UUID, sa.ForeignKey("findings.id", ondelete="CASCADE")),
        sa.Column("rule_id", sa.String(160), nullable=False),
        sa.Column("arm_id", sa.Text),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=False),
        sa.Column("requested_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("requested_at", TS, server_default=sa.func.now(), nullable=False),
        sa.Column("approved_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("decided_at", TS),
        sa.Column("decision_note", sa.Text),
        sa.Column("expires_at", TS, nullable=False),
        _created(),
    )
    op.create_index("ix_finding_exceptions_org_id", "finding_exceptions", ["org_id"])
    op.create_index("ix_finding_exceptions_rule", "finding_exceptions", ["org_id", "rule_id"])

    op.create_table(
        "finding_comments",
        _id(),
        _org(),
        sa.Column(
            "finding_id", UUID, sa.ForeignKey("findings.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("kind", sa.String(20), server_default="comment", nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        _created(),
    )
    op.create_index("ix_finding_comments_org_id", "finding_comments", ["org_id"])
    op.create_index("ix_finding_comments_finding", "finding_comments", ["finding_id"])

    op.create_table(
        "vulnerabilities",
        _id(),
        _org(),
        _scan(),
        *_resource_cols(),
        sa.Column("cve", sa.String(40), nullable=False),
        sa.Column("title", sa.String(300), server_default="", nullable=False),
        sa.Column("severity", sa.String(10), nullable=False),
        sa.Column("cvss", sa.Numeric(4, 1)),
        sa.Column("exploitable", sa.Boolean, server_default=sa.text("false"), nullable=False),
        sa.Column("patchable", sa.Boolean, server_default=sa.text("false"), nullable=False),
        sa.Column("fixed_version", sa.String(100)),
        sa.Column("source", sa.String(40), nullable=False),
        sa.Column("image", sa.String(300)),
        sa.Column("priority", sa.Integer, server_default=sa.text("0"), nullable=False),
        _jsonb("attrs"),
    )
    op.create_index("ix_vulnerabilities_org_id", "vulnerabilities", ["org_id"])
    op.create_index("ix_vulnerabilities_scan", "vulnerabilities", ["scan_id"])

    op.create_table(
        "security_alerts",
        _id(),
        _org(),
        _scan(),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("alert_id", sa.String(300), nullable=False),
        sa.Column("severity", sa.String(10), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("description", sa.Text, server_default="", nullable=False),
        sa.Column("arm_id", sa.Text),
        sa.Column("resource_name", sa.String(300)),
        sa.Column("status", sa.String(20)),
        sa.Column("detected_at", TS),
        _jsonb("attrs"),
    )
    op.create_index("ix_security_alerts_org_id", "security_alerts", ["org_id"])
    op.create_index("ix_security_alerts_scan", "security_alerts", ["scan_id"])

    op.create_table(
        "exposures",
        _id(),
        _org(),
        _scan(),
        *_resource_cols(),
        sa.Column("resource_group", sa.String(200)),
        sa.Column("subscription_id", sa.String(64)),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("public_ip", sa.String(64)),
        sa.Column("endpoint", sa.String(300)),
        sa.Column("severity", sa.String(10), nullable=False),
        _jsonb("ports", "'[]'::jsonb"),
        _jsonb("path", "'[]'::jsonb"),
    )
    op.create_index("ix_exposures_org_id", "exposures", ["org_id"])
    op.create_index("ix_exposures_scan", "exposures", ["scan_id"])

    op.create_table(
        "attack_paths",
        _id(),
        _org(),
        _scan(),
        sa.Column("key", sa.String(64), nullable=False),
        sa.Column("score", sa.Integer, nullable=False),
        sa.Column("severity", sa.String(10), nullable=False),
        sa.Column("entry_arm_id", sa.Text, nullable=False),
        sa.Column("target_arm_id", sa.Text, nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("summary", sa.Text, server_default="", nullable=False),
        _jsonb("path"),
        _jsonb("factors"),
        _jsonb("reachable", "'[]'::jsonb"),
        sa.UniqueConstraint("scan_id", "key", name="uq_attack_paths_scan_key"),
    )
    op.create_index("ix_attack_paths_org_id", "attack_paths", ["org_id"])

    op.create_table(
        "compliance_results",
        _id(),
        _org(),
        _scan(),
        sa.Column("framework", sa.String(20), nullable=False),
        sa.Column("control_id", sa.String(40), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("passed", sa.Integer, server_default=sa.text("0"), nullable=False),
        sa.Column("failed", sa.Integer, server_default=sa.text("0"), nullable=False),
        _jsonb("rules", "'[]'::jsonb"),
        sa.UniqueConstraint(
            "scan_id", "framework", "control_id", name="uq_compliance_results_scan_control"
        ),
    )
    op.create_index("ix_compliance_results_org_id", "compliance_results", ["org_id"])

    op.create_table(
        "scores",
        _id(),
        _org(),
        _scan(),
        sa.Column("overall", sa.Integer),
        sa.Column("grade", sa.String(1)),
        sa.Column("security", sa.Integer),
        sa.Column("cost", sa.Integer),
        sa.Column("reliability", sa.Integer),
        sa.Column("operations", sa.Integer),
        sa.Column("performance", sa.Integer),
        sa.Column("governance", sa.Integer),
        sa.Column("secure_score", sa.Numeric(5, 1)),
        _jsonb("details"),
        _created(),
        sa.UniqueConstraint("scan_id", name="uq_scores_scan"),
    )
    op.create_index("ix_scores_org_id", "scores", ["org_id"])

    op.create_table(
        "identities_entra",
        _id(),
        _org(),
        _scan(),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("object_id", sa.String(64), nullable=False),
        sa.Column("display_name", sa.String(300), server_default="", nullable=False),
        _jsonb("attrs"),
    )
    op.create_index("ix_identities_entra_org_id", "identities_entra", ["org_id"])
    op.create_index("ix_identities_entra_scan_kind", "identities_entra", ["scan_id", "kind"])

    op.create_table(
        "custom_rules",
        _id(),
        _org(),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text, server_default="", nullable=False),
        sa.Column("kql", sa.Text, nullable=False),
        sa.Column("severity", sa.String(10), nullable=False),
        sa.Column("pillar", sa.String(20), server_default="security", nullable=False),
        sa.Column("category", sa.String(80), server_default="Custom", nullable=False),
        _jsonb("frameworks"),
        sa.Column("remediation", sa.Text, server_default="", nullable=False),
        sa.Column("enabled", sa.Boolean, server_default=sa.text("true"), nullable=False),
        sa.Column("last_validated_at", TS),
        sa.Column("last_error", sa.Text),
        sa.Column("last_result_count", sa.Integer),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        _created(),
        _updated(),
        sa.UniqueConstraint("org_id", "name", name="uq_custom_rules_org_name"),
    )
    op.create_index("ix_custom_rules_org_id", "custom_rules", ["org_id"])

    op.create_table(
        "retirement_catalog",
        _id(),
        sa.Column("key", sa.String(80), nullable=False, unique=True),
        sa.Column("service", sa.String(120), nullable=False),
        sa.Column("resource_type", sa.String(200), nullable=False),
        _jsonb("match"),
        sa.Column("retirement_date", sa.Date, nullable=False),
        sa.Column("source_url", sa.String(500), server_default="", nullable=False),
        sa.Column("hint", sa.Text, server_default="", nullable=False),
        sa.Column("verified", sa.Boolean, server_default=sa.text("false"), nullable=False),
        _created(),
        _updated(),
    )

    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        expr = f"{ORG} OR {SYSTEM}"
        op.execute(f"CREATE POLICY tenant_isolation ON {table} USING ({expr}) WITH CHECK ({expr})")
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
    op.drop_table("retirement_catalog")
    for table in reversed(TABLES):
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.drop_table(table)

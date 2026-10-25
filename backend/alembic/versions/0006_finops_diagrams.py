"""FinOps and architecture diagrams (Phase 4).

- cost_daily: daily cost per resource and meter category, actual + amortized, RANGE-partitioned
  by month (plan Section 12). Partitions are created by `kr_ensure_cost_partitions(from, to)` and
  dropped by `kr_drop_cost_partitions_before(cutoff)`: SECURITY DEFINER functions owned by the
  migration role, so the application role can keep partitions current without DDL rights.
  A DEFAULT partition catches anything outside the created range.
- cost_forecasts, cost_anomalies, budgets, metrics_summary, rightsizing, savings_tracker.
- price_cache: Azure Retail Prices answers (platform table, no RLS).
- diagrams (per-scan views, JSON in Blob) and diagram_annotations (sticky notes per org).

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = pg.UUID(as_uuid=True)
JSONB = pg.JSONB()
TS = sa.DateTime(timezone=True)
MONEY = sa.Numeric(18, 6)

ORG = "org_id = NULLIF(current_setting('app.org_id', true), '')::uuid"
SYSTEM = "current_setting('app.system', true) = 'on'"
POLICY = f"{ORG} OR {SYSTEM}"
POLICY_SQL = POLICY.replace("'", "''")  # inside a quoted format() string
TABLES = (
    "cost_daily",
    "cost_forecasts",
    "cost_anomalies",
    "budgets",
    "metrics_summary",
    "rightsizing",
    "savings_tracker",
    "diagrams",
    "diagram_annotations",
)


def _id() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("id", UUID, primary_key=True, server_default=sa.text("gen_random_uuid()"))


def _org() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(
        "org_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )


def _scan() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("scan_id", UUID, sa.ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)


def _conn() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(
        "connection_id", UUID, sa.ForeignKey("connections.id", ondelete="CASCADE"), nullable=False
    )


def _jsonb(name: str, default: str = "'{}'::jsonb") -> sa.Column:  # type: ignore[type-arg]
    return sa.Column(name, JSONB, server_default=sa.text(default), nullable=False)


def _created() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("created_at", TS, server_default=sa.func.now(), nullable=False)


def _updated() -> sa.Column:  # type: ignore[type-arg]
    return sa.Column("updated_at", TS, server_default=sa.func.now(), nullable=False)


PARTITION_FUNCTIONS = f"""
CREATE OR REPLACE FUNCTION kr_ensure_cost_partitions(from_date date, to_date date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  m date := date_trunc('month', from_date)::date;
  last_month date := date_trunc('month', to_date)::date;
  part text;
  created integer := 0;
  prev text := coalesce(current_setting('app.system', true), '');
BEGIN
  IF from_date IS NULL OR to_date IS NULL OR to_date < from_date THEN
    RETURN 0;
  END IF;
  IF (last_month - m) > 800 THEN
    RAISE EXCEPTION 'partition range too large';
  END IF;
  -- FORCE RLS applies to the owner too: moving rows must see every tenant. Restored below.
  PERFORM set_config('app.system', 'on', true);
  WHILE m <= last_month LOOP
    part := format('cost_daily_y%sm%s', to_char(m, 'YYYY'), to_char(m, 'MM'));
    IF to_regclass('public.' || part) IS NULL THEN
      -- Rows of that month may already sit in the default partition: move them over.
      CREATE TEMP TABLE IF NOT EXISTS kr_cost_move (LIKE cost_daily) ON COMMIT DROP;
      WITH moved AS (
        DELETE FROM cost_daily_default
        WHERE usage_date >= m AND usage_date < (m + interval '1 month')::date
        RETURNING *
      )
      INSERT INTO kr_cost_move SELECT * FROM moved;
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF cost_daily FOR VALUES FROM (%L) TO (%L)',
        part, m, (m + interval '1 month')::date
      );
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', part);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', part);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I USING ({POLICY_SQL}) WITH CHECK ({POLICY_SQL})',
        part
      );
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kloudrecon_app') THEN
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO kloudrecon_app', part);
      END IF;
      INSERT INTO cost_daily SELECT * FROM kr_cost_move
        WHERE usage_date >= m AND usage_date < (m + interval '1 month')::date;
      DELETE FROM kr_cost_move;
      created := created + 1;
    END IF;
    m := (m + interval '1 month')::date;
  END LOOP;
  PERFORM set_config('app.system', prev, true);
  RETURN created;
END
$fn$;

CREATE OR REPLACE FUNCTION kr_drop_cost_partitions_before(cutoff date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  r record;
  dropped integer := 0;
  boundary date := date_trunc('month', cutoff)::date;
  prev text := coalesce(current_setting('app.system', true), '');
BEGIN
  PERFORM set_config('app.system', 'on', true);
  FOR r IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'cost_daily' AND c.relname ~ '^cost_daily_y[0-9]{{4}}m[0-9]{{2}}$'
  LOOP
    IF to_date(substr(r.relname, 13, 4) || substr(r.relname, 18, 2) || '01', 'YYYYMMDD')
       < boundary THEN
      EXECUTE format('DROP TABLE %I', r.relname);
      dropped := dropped + 1;
    END IF;
  END LOOP;
  DELETE FROM cost_daily_default WHERE usage_date < boundary;
  PERFORM set_config('app.system', prev, true);
  RETURN dropped;
END
$fn$;
"""


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE cost_daily (
          id uuid NOT NULL DEFAULT gen_random_uuid(),
          usage_date date NOT NULL,
          org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          connection_id uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
          subscription_id varchar(64) NOT NULL,
          arm_id text NOT NULL DEFAULT '',
          resource_name varchar(300) NOT NULL DEFAULT '',
          resource_group varchar(200) NOT NULL DEFAULT '',
          resource_type varchar(200) NOT NULL DEFAULT '',
          service varchar(120) NOT NULL DEFAULT '',
          meter_category varchar(120) NOT NULL DEFAULT '',
          location varchar(64) NOT NULL DEFAULT '',
          tags jsonb NOT NULL DEFAULT '{}'::jsonb,
          cost_actual numeric(18, 6) NOT NULL DEFAULT 0,
          cost_amortized numeric(18, 6) NOT NULL DEFAULT 0,
          currency varchar(8) NOT NULL DEFAULT 'USD',
          PRIMARY KEY (id, usage_date)
        ) PARTITION BY RANGE (usage_date)
        """
    )
    op.execute("CREATE TABLE cost_daily_default PARTITION OF cost_daily DEFAULT")
    op.create_index("ix_cost_daily_org_date", "cost_daily", ["org_id", "usage_date"])
    op.create_index("ix_cost_daily_conn_date", "cost_daily", ["connection_id", "usage_date"])
    op.create_index("ix_cost_daily_org_arm", "cost_daily", ["org_id", "arm_id", "usage_date"])

    op.create_table(
        "cost_forecasts",
        _id(),
        _org(),
        _scan(),
        _conn(),
        sa.Column("scope", sa.String(200), server_default="total", nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("p10", MONEY, nullable=False),
        sa.Column("p50", MONEY, nullable=False),
        sa.Column("p90", MONEY, nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
    )
    op.create_index("ix_cost_forecasts_org_id", "cost_forecasts", ["org_id"])
    op.create_index("ix_cost_forecasts_scan_scope", "cost_forecasts", ["scan_id", "scope", "date"])

    op.create_table(
        "cost_anomalies",
        _id(),
        _org(),
        _conn(),
        sa.Column("scope", sa.String(300), server_default="total", nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("days", sa.Integer, server_default=sa.text("1"), nullable=False),
        sa.Column("expected", MONEY, nullable=False),
        sa.Column("actual", MONEY, nullable=False),
        sa.Column("delta", MONEY, nullable=False),
        _jsonb("driver"),
        sa.Column("status", sa.String(20), server_default="open", nullable=False),
        sa.Column("currency", sa.String(8), server_default="USD", nullable=False),
        sa.Column(
            "detected_scan_id", UUID, sa.ForeignKey("scans.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("notified", sa.Boolean, server_default=sa.text("false"), nullable=False),
        _created(),
        _updated(),
        sa.UniqueConstraint("connection_id", "scope", "date", name="uq_cost_anomalies_conn_scope"),
    )
    op.create_index("ix_cost_anomalies_org_id", "cost_anomalies", ["org_id"])
    op.create_index("ix_cost_anomalies_org_date", "cost_anomalies", ["org_id", "date"])

    op.create_table(
        "budgets",
        _id(),
        _org(),
        _scan(),
        _conn(),
        sa.Column("subscription_id", sa.String(64), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("grain", sa.String(20), server_default="Monthly", nullable=False),
        sa.Column("spend", MONEY),
        sa.Column("forecast", MONEY),
        sa.Column("currency", sa.String(8), server_default="USD", nullable=False),
        _jsonb("attrs"),
    )
    op.create_index("ix_budgets_org_id", "budgets", ["org_id"])
    op.create_index("ix_budgets_scan", "budgets", ["scan_id"])

    op.create_table(
        "metrics_summary",
        _id(),
        _org(),
        _scan(),
        sa.Column("arm_id", sa.Text, nullable=False),
        sa.Column("resource_type", sa.String(200), server_default="", nullable=False),
        sa.Column("metric", sa.String(60), nullable=False),
        sa.Column("unit", sa.String(20), server_default="Percent", nullable=False),
        sa.Column("avg", sa.Numeric(14, 4)),
        sa.Column("p50", sa.Numeric(14, 4)),
        sa.Column("p95", sa.Numeric(14, 4)),
        sa.Column("max", sa.Numeric(14, 4)),
        sa.Column("samples", sa.Integer, server_default=sa.text("0"), nullable=False),
        sa.Column("period_days", sa.Integer, server_default=sa.text("30"), nullable=False),
        _jsonb("series", "'[]'::jsonb"),
    )
    op.create_index("ix_metrics_summary_org_id", "metrics_summary", ["org_id"])
    op.create_index("ix_metrics_summary_scan_arm", "metrics_summary", ["scan_id", "arm_id"])

    op.create_table(
        "rightsizing",
        _id(),
        _org(),
        _scan(),
        _conn(),
        sa.Column("arm_id", sa.Text, nullable=False),
        sa.Column("resource_name", sa.String(300), nullable=False),
        sa.Column("resource_type", sa.String(200), nullable=False),
        sa.Column("resource_group", sa.String(200)),
        sa.Column("subscription_id", sa.String(64)),
        sa.Column("location", sa.String(64)),
        sa.Column("action", sa.String(20), server_default="resize", nullable=False),
        sa.Column("current_sku", sa.String(120), nullable=False),
        sa.Column("recommended_sku", sa.String(120), nullable=False),
        sa.Column("current_monthly", MONEY, nullable=False),
        sa.Column("recommended_monthly", MONEY, nullable=False),
        sa.Column("monthly_saving", MONEY, nullable=False),
        sa.Column("confidence", sa.String(10), nullable=False),
        sa.Column("risk_note", sa.Text, server_default="", nullable=False),
        _jsonb("metrics"),
        sa.Column("price_source", sa.String(20), server_default="catalog", nullable=False),
        sa.Column("currency", sa.String(8), server_default="USD", nullable=False),
    )
    op.create_index("ix_rightsizing_org_id", "rightsizing", ["org_id"])
    op.create_index("ix_rightsizing_scan", "rightsizing", ["scan_id"])

    op.create_table(
        "savings_tracker",
        _id(),
        _org(),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("ref", sa.String(300), nullable=False),
        sa.Column(
            "finding_id", UUID, sa.ForeignKey("findings.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column("arm_id", sa.Text, server_default="", nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("expected_monthly", MONEY, nullable=False),
        sa.Column("baseline_monthly", MONEY),
        sa.Column("realized_monthly", MONEY),
        sa.Column("currency", sa.String(8), server_default="USD", nullable=False),
        sa.Column("status", sa.String(20), server_default="tracking", nullable=False),
        sa.Column("implemented_at", TS, nullable=False),
        sa.Column("implemented_by", UUID),
        sa.Column("measured_at", TS),
        sa.Column("days_measured", sa.Integer, server_default=sa.text("0"), nullable=False),
        sa.Column("notes", sa.Text, server_default="", nullable=False),
        _created(),
        sa.UniqueConstraint("org_id", "source", "ref", name="uq_savings_org_ref"),
    )
    op.create_index("ix_savings_tracker_org_id", "savings_tracker", ["org_id"])

    op.create_table(
        "price_cache",
        sa.Column("key", sa.String(300), primary_key=True),
        sa.Column("unit_price", sa.Numeric(18, 8)),
        sa.Column("unit", sa.String(40), server_default="1 Hour", nullable=False),
        sa.Column("currency", sa.String(8), server_default="USD", nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("fetched_at", TS, nullable=False),
        _jsonb("data"),
    )

    op.create_table(
        "diagrams",
        _id(),
        _org(),
        _scan(),
        sa.Column("view", sa.String(40), nullable=False),
        sa.Column("variant", sa.String(80), server_default="", nullable=False),
        sa.Column("blob_path", sa.Text, nullable=False),
        sa.Column("node_count", sa.Integer, server_default=sa.text("0"), nullable=False),
        sa.Column("edge_count", sa.Integer, server_default=sa.text("0"), nullable=False),
        sa.Column("built_ms", sa.Integer, server_default=sa.text("0"), nullable=False),
        _created(),
        sa.UniqueConstraint("scan_id", "view", "variant", name="uq_diagrams_scan_view"),
    )
    op.create_index("ix_diagrams_org_id", "diagrams", ["org_id"])

    op.create_table(
        "diagram_annotations",
        _id(),
        _org(),
        sa.Column("view", sa.String(40), nullable=False),
        sa.Column("node_ref", sa.Text),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("color", sa.String(20), server_default="yellow", nullable=False),
        _jsonb("position"),
        sa.Column("created_by", UUID),
        _created(),
        _updated(),
    )
    op.create_index("ix_diagram_annotations_org_id", "diagram_annotations", ["org_id"])
    op.create_index("ix_diagram_annotations_org_view", "diagram_annotations", ["org_id", "view"])

    for table in (*TABLES, "cost_daily_default"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} USING ({POLICY}) WITH CHECK ({POLICY})"
        )
    op.execute(PARTITION_FUNCTIONS)
    op.execute("REVOKE ALL ON FUNCTION kr_ensure_cost_partitions(date, date) FROM PUBLIC")
    op.execute("REVOKE ALL ON FUNCTION kr_drop_cost_partitions_before(date) FROM PUBLIC")
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kloudrecon_app') THEN
            GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO kloudrecon_app;
            GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO kloudrecon_app;
            GRANT EXECUTE ON FUNCTION kr_ensure_cost_partitions(date, date) TO kloudrecon_app;
            GRANT EXECUTE ON FUNCTION kr_drop_cost_partitions_before(date) TO kloudrecon_app;
            REVOKE ALL ON TABLE alembic_version FROM kloudrecon_app;
          END IF;
        END
        $$;
        """
    )
    # 13 months back and 3 ahead exist from the start; the cost stage extends the range.
    op.execute(
        "SELECT kr_ensure_cost_partitions("
        "(date_trunc('month', now()) - interval '13 months')::date, "
        "(date_trunc('month', now()) + interval '3 months')::date)"
    )


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS kr_drop_cost_partitions_before(date)")
    op.execute("DROP FUNCTION IF EXISTS kr_ensure_cost_partitions(date, date)")
    op.drop_table("price_cache")
    for table in reversed(TABLES):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")

"""Test harness: a real PostgreSQL (Docker locally, service container in CI).

- TEST_DATABASE_URL points at a superuser connection (it owns the schema, like kloudrecon_owner).
- The app under test connects as `kloudrecon_app` (created here if missing), so RLS is enforced.
- The schema is rebuilt with Alembic once per session; tables are truncated before each test.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url

BACKEND = Path(__file__).resolve().parents[1]


def _read_dotenv(name: str) -> str | None:
    env_file = BACKEND / ".env"
    if not env_file.exists():
        return None
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if line.startswith(f"{name}="):
            return line.split("=", 1)[1].strip()
    return None


ADMIN_URL = (
    os.environ.get("TEST_DATABASE_URL")
    or _read_dotenv("TEST_DATABASE_URL")
    or "postgresql+psycopg://kloudrecon:kloudrecon@localhost:5432/kloudrecon_test"
)
APP_URL = make_url(ADMIN_URL).set(username="kloudrecon_app", password="kloudrecon_app")
APP_URL_STR = APP_URL.render_as_string(hide_password=False)

# Configure the app for tests BEFORE any kloudrecon import reads settings.
os.environ.update(
    {
        "ENV": "test",
        "AUTH_MODE": "dev",
        "DATABASE_URL": APP_URL_STR,
        "DATABASE_MIGRATION_URL": ADMIN_URL,
        "SECRET_STORE": "memory",
        "BLOB_MODE": "memory",
        "EMAIL_MODE": "memory",
        "AI_MODE": "mock",
        "PRICES_MODE": "static",
        "REPORT_RENDERER": "minipdf",
        "BOOTSTRAP_OWNER_EMAILS": "owner@local.test",
        "DEV_AUTH_SECRET": "test-secret-0123456789abcdef0123456789",
        "CORS_ALLOWED_ORIGINS": "http://localhost:5173",
        "RATE_LIMIT_DEFAULT": "10000/minute",
        "LOG_FORMAT": "console",
        "APPLICATIONINSIGHTS_CONNECTION_STRING": "",
    }
)

TABLES = (
    "server_checks, servers, auth_challenges, local_credentials, "
    "announcements, feature_flags, email_templates, "
    "billing_events, plan_changes, billing_accounts, "
    "alert_deliveries, alert_rules, integrations, reports, report_schedules, "
    "chat_messages, chat_sessions, ai_usage, ai_generations, "
    "recommendation_comments, recommendation_states, "
    "retirement_catalog, custom_rules, identities_entra, scores, compliance_results, attack_paths, "
    "exposures, security_alerts, vulnerabilities, finding_comments, finding_exceptions, "
    "finding_occurrences, findings, scan_artifacts, "
    "audit_logs, notifications, events, jobs, invitations, rbac_assignments, resource_changes, "
    "resource_edges, resource_groups, resources, scan_stage_logs, scans, management_groups, "
    "azure_subscriptions, connections, users, organizations, plans, worker_heartbeats"
)
FIXTURES = BACKEND / "tests" / "fixtures" / "azure"


def _admin_dsn() -> str:
    return ADMIN_URL.replace("postgresql+psycopg://", "postgresql://", 1)


@pytest.fixture(scope="session", autouse=True)
def _database() -> None:
    from alembic import command
    from alembic.config import Config

    with psycopg.connect(_admin_dsn(), autocommit=True) as conn:
        exists = conn.execute("SELECT 1 FROM pg_roles WHERE rolname = 'kloudrecon_app'").fetchone()
        if not exists:
            conn.execute("CREATE ROLE kloudrecon_app LOGIN PASSWORD 'kloudrecon_app'")
        dbname = make_url(ADMIN_URL).database
        conn.execute(f'GRANT CONNECT ON DATABASE "{dbname}" TO kloudrecon_app')
        conn.execute("DROP SCHEMA IF EXISTS public CASCADE")
        conn.execute("CREATE SCHEMA public")
        conn.execute("GRANT USAGE ON SCHEMA public TO kloudrecon_app")

    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    cfg.set_main_option("sqlalchemy.url", ADMIN_URL)
    command.upgrade(cfg, "head")


@pytest.fixture(autouse=True)
def _clean_tables(_database: None) -> None:
    with psycopg.connect(_admin_dsn(), autocommit=True) as conn:
        conn.execute(f"TRUNCATE {TABLES} RESTART IDENTITY CASCADE")
    from kloudrecon.services.infra import get_email_sender

    sender = get_email_sender()
    if hasattr(sender, "sent"):
        sender.sent.clear()
    from kloudrecon.services.infra import get_secret_store

    store = get_secret_store()
    if hasattr(store, "_data"):
        store._data.clear()


@pytest.fixture(autouse=True)
def _reset_azure_builder() -> Iterator[None]:
    yield
    from kloudrecon.services.azure.factory import set_rest_builder

    set_rest_builder(None)


def use_azure_fixture(name: str) -> list[object]:
    """Route RestAzureGateway to a recorded fixture file; returns the list of transports used."""
    from kloudrecon.services.azure.factory import Credentials, set_rest_builder
    from kloudrecon.services.azure.fixtures import FixtureTransport
    from kloudrecon.services.azure.rest import RestAzureGateway

    transports: list[object] = []

    def build(creds: Credentials) -> RestAzureGateway:
        transport = FixtureTransport.from_file(FIXTURES / f"{name}.json")
        transports.append(transport)
        return RestAzureGateway(
            tenant_id=creds.tenant_id,
            client_id=creds.client_id,
            client_secret=creds.secret,
            transport=transport,
            deadline=creds.deadline,
            sleep=lambda _s: None,
        )

    set_rest_builder(build)
    return transports


@pytest.fixture
def admin_conn() -> Iterator[psycopg.Connection[tuple[object, ...]]]:
    """Superuser connection for arranging data and asserting bypassing RLS."""
    with psycopg.connect(_admin_dsn(), autocommit=True) as conn:
        yield conn


@pytest.fixture
def client() -> Iterator[TestClient]:
    from kloudrecon.api.main import create_app

    with TestClient(create_app(start_listener=False)) as c:
        yield c


@pytest.fixture
def seeded() -> None:
    from kloudrecon.core.db import session_scope
    from kloudrecon.services.seed import seed_dev

    with session_scope() as s:
        seed_dev(s)


def auth_headers(client: TestClient, email: str, name: str = "") -> dict[str, str]:
    resp = client.post("/api/v1/auth/dev/login", json={"email": email, "name": name})
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


ONBOARDING = {
    "name": "Jane Doe",
    "company": "Contoso Test",
    "country": "Germany",
    "job_title": "CTO",
    "phone": "+49 30 1234",
    "company_size": "51-200",
    "industry": "Finance",
    "use_case": "Understand our Azure security posture and costs.",
    "accept_terms": True,
}


def register(client: TestClient, email: str) -> dict[str, str]:
    """Sign in as a new identity and complete onboarding; returns auth headers."""
    headers = auth_headers(client, email)
    resp = client.post("/api/v1/onboarding", json=ONBOARDING, headers=headers)
    assert resp.status_code == 201, resp.text
    return headers


def run_jobs(job_type: str) -> int:
    """Run queued jobs of one type in-process (like the worker would); returns how many ran.
    Other job types stay queued."""
    from sqlalchemy import text

    from kloudrecon.core.db import session_scope
    from kloudrecon.core.rls import enable_system
    from kloudrecon.jobs import queue
    from kloudrecon.jobs.handlers import HANDLERS, JobContext

    ran = 0
    while True:
        with session_scope() as s:
            enable_system(s)
            row = (
                s.execute(
                    text(
                        "UPDATE jobs SET status = 'running', attempts = attempts + 1, "
                        "locked_by = 'test', locked_at = now() WHERE id = ("
                        "SELECT id FROM jobs WHERE status = 'queued' AND type = :t "
                        "ORDER BY priority, created_at LIMIT 1) "
                        "RETURNING id, org_id, type, payload, attempts, max_attempts"
                    ),
                    {"t": job_type},
                )
                .mappings()
                .first()
            )
        if row is None:
            return ran
        job = queue.ClaimedJob(
            id=row["id"],
            org_id=row["org_id"],
            type=row["type"],
            payload=dict(row["payload"] or {}),
            attempts=row["attempts"],
            max_attempts=row["max_attempts"],
        )
        HANDLERS[job.type](JobContext(job=job, worker_id="test"))
        with session_scope() as s:
            enable_system(s)
            queue.complete(s, job.id)
        ran += 1

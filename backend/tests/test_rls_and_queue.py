from __future__ import annotations

import uuid

import psycopg
import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import ProgrammingError

from kloudrecon.core.db import session_scope
from kloudrecon.core.rls import set_tenant, system_context
from kloudrecon.domain.models import Job, Organization, User
from kloudrecon.jobs import queue


def _make_org(conn: psycopg.Connection[tuple[object, ...]], name: str) -> uuid.UUID:
    org_id = uuid.uuid4()
    conn.execute(
        "INSERT INTO organizations (id, name, status) VALUES (%s, %s, 'active')", (org_id, name)
    )
    conn.execute(
        "INSERT INTO users (org_id, external_oid, email, status, org_role) "
        "VALUES (%s, %s, %s, 'active', 'owner')",
        (org_id, f"oid-{name}", f"admin@{name}.test"),
    )
    return org_id


def test_rls_hides_other_tenants(admin_conn: psycopg.Connection[tuple[object, ...]]) -> None:
    org_a = _make_org(admin_conn, "a")
    org_b = _make_org(admin_conn, "b")
    with session_scope() as s:
        set_tenant(s, org_a)
        orgs = s.scalars(select(Organization)).all()
        users = s.scalars(select(User)).all()
    assert [o.id for o in orgs] == [org_a]
    assert {u.org_id for u in users} == {org_a}
    assert org_b not in {o.id for o in orgs}


def test_rls_without_context_sees_nothing(
    admin_conn: psycopg.Connection[tuple[object, ...]],
) -> None:
    _make_org(admin_conn, "a")
    with session_scope() as s:
        assert s.scalars(select(Organization)).all() == []
        assert s.scalars(select(User)).all() == []


def test_rls_blocks_cross_tenant_writes(
    admin_conn: psycopg.Connection[tuple[object, ...]],
) -> None:
    org_a = _make_org(admin_conn, "a")
    org_b = _make_org(admin_conn, "b")
    with session_scope() as s:
        set_tenant(s, org_a)
        s.add(User(org_id=org_b, external_oid="intruder", email="x@b.test"))
        with pytest.raises(ProgrammingError, match="row-level security"):
            s.flush()
        s.rollback()


def test_rls_update_of_other_tenant_affects_no_rows(
    admin_conn: psycopg.Connection[tuple[object, ...]],
) -> None:
    org_a = _make_org(admin_conn, "a")
    org_b = _make_org(admin_conn, "b")
    with session_scope() as s:
        set_tenant(s, org_a)
        result = s.execute(
            text("UPDATE organizations SET name = 'pwned' WHERE id = :id"), {"id": org_b}
        )
        assert getattr(result, "rowcount", None) == 0
    row = admin_conn.execute("SELECT name FROM organizations WHERE id = %s", (org_b,)).fetchone()
    assert row == ("b",)


def test_system_context_sees_all(admin_conn: psycopg.Connection[tuple[object, ...]]) -> None:
    _make_org(admin_conn, "a")
    _make_org(admin_conn, "b")
    with session_scope() as s:
        set_tenant(s, None)
        with system_context(s):
            assert len(s.scalars(select(Organization)).all()) == 2
        # context restored
        assert s.scalars(select(Organization)).all() == []


def test_tenant_settings_do_not_leak_between_transactions(
    admin_conn: psycopg.Connection[tuple[object, ...]],
) -> None:
    org_a = _make_org(admin_conn, "a")
    with session_scope() as s:
        set_tenant(s, org_a)
        assert len(s.scalars(select(Organization)).all()) == 1
    with session_scope() as s:
        assert s.scalars(select(Organization)).all() == []


def test_queue_claim_complete_and_retry() -> None:
    with session_scope() as s, system_context(s):
        job_id = queue.enqueue(s, "notify.email", {"template": "x"}, max_attempts=2)
    with session_scope() as s, system_context(s):
        job = queue.claim(s, "w1")
        assert job is not None
        assert job.id == job_id
        assert job.attempts == 1
        assert queue.claim(s, "w2") is None  # nothing else queued
        assert queue.fail(s, job, "boom") == "queued"
    with session_scope() as s, system_context(s):
        s.execute(text("UPDATE jobs SET run_after = now()"))
        job = queue.claim(s, "w1")
        assert job is not None
        assert job.attempts == 2
        assert queue.fail(s, job, "boom again") == "dead"
        assert queue.queue_stats(s)["dead"] == 1
        assert queue.retry_dead(s, job_id)
    with session_scope() as s, system_context(s):
        stored = s.get(Job, job_id)
        assert stored is not None
        assert stored.status == "queued"
        assert stored.attempts == 0


def test_queue_skip_locked_between_sessions() -> None:
    with session_scope() as s, system_context(s):
        queue.enqueue(s, "notify.email", {})
        queue.enqueue(s, "notify.email", {})
    with session_scope() as s1, session_scope() as s2:
        with system_context(s1), system_context(s2):
            a = queue.claim(s1, "w1")
            b = queue.claim(s2, "w2")
        assert a is not None
        assert b is not None
        assert a.id != b.id


def test_backoff_grows() -> None:
    assert queue.backoff_seconds(1) < queue.backoff_seconds(3) < 3600 * 1.3

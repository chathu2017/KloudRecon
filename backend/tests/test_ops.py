from __future__ import annotations

import subprocess
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from kloudrecon.core.config import get_settings
from kloudrecon.ops import backup
from kloudrecon.services.infra.blob import MemoryBlobStore


def test_libpq_args_peer_socket_url() -> None:
    args, env = backup.libpq_args(
        "postgresql+psycopg://kloudrecon_owner@/kloudrecon?host=/var/run/postgresql"
    )
    assert args == [
        "--host",
        "/var/run/postgresql",
        "--username",
        "kloudrecon_owner",
        "--dbname",
        "kloudrecon",
    ]
    assert env == {}


def test_libpq_args_password_goes_to_env_not_argv() -> None:
    args, env = backup.libpq_args("postgresql+psycopg://u:s3cret@localhost:5432/db")
    assert "s3cret" not in " ".join(args)
    assert env == {"PGPASSWORD": "s3cret"}


def test_prune_removes_only_old_dumps() -> None:
    blob = MemoryBlobStore()
    blob.upload_bytes("db-backups", "kloudrecon-old.dump", b"x")
    blob.upload_bytes("db-backups", "kloudrecon-new.dump", b"y")
    blob.upload_bytes("db-backups", "other.txt", b"z")
    now = datetime.now(UTC)
    blob._modified[("db-backups", "kloudrecon-old.dump")] = now - timedelta(days=31)
    assert backup.prune(blob, now=now) == 1
    names = {b.name for b in blob.list_blobs("db-backups")}
    assert names == {"kloudrecon-new.dump", "other.txt"}


def test_run_backup_uploads_dump(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[list[str]] = []

    def fake_run(cmd: list[str], **kwargs: Any) -> subprocess.CompletedProcess[bytes]:
        calls.append(cmd)
        Path(cmd[cmd.index("--file") + 1]).write_bytes(b"PGDMP-fake")
        assert "PGPASSWORD" in kwargs["env"]  # test DB URL has a password
        return subprocess.CompletedProcess(cmd, 0, b"", b"")

    monkeypatch.setattr(backup.shutil, "which", lambda _name: "/usr/bin/pg_dump")
    monkeypatch.setattr(backup.subprocess, "run", fake_run)
    blob = MemoryBlobStore()
    name = backup.run_backup(get_settings(), blob)
    assert name.startswith("kloudrecon-")
    assert name.endswith(".dump")
    assert blob.download_bytes("db-backups", name) == b"PGDMP-fake"
    assert "--format=custom" in calls[0]


def test_run_backup_requires_pg_dump(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(backup.shutil, "which", lambda _name: None)
    with pytest.raises(RuntimeError, match="pg_dump"):
        backup.run_backup(get_settings(), MemoryBlobStore())

"""Nightly PostgreSQL backup: `python -m kloudrecon.ops.backup`.

Run by `kloudrecon-backup.timer` (02:30 UTC) as the `kloudrecon` user. `pg_dump -Fc` connects
with DATABASE_MIGRATION_URL (the owner role, peer auth, BYPASSRLS so the dump is complete),
uploads to Blob `db-backups/` with the VM managed identity, and deletes dumps older than
30 days. Exit code 1 on failure (visible in `systemctl status kloudrecon-backup`).
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy.engine import make_url

from kloudrecon.core.config import Settings, get_settings
from kloudrecon.core.logging import configure_logging, get_logger
from kloudrecon.core.telemetry import setup_telemetry, track_event
from kloudrecon.services.infra import build_blob_store
from kloudrecon.services.infra.blob import BlobStore

log = get_logger("kloudrecon.backup")

CONTAINER = "db-backups"
RETENTION_DAYS = 30


def libpq_args(sqlalchemy_url: str) -> tuple[list[str], dict[str, str]]:
    """pg_dump arguments + environment from a SQLAlchemy URL (password via PGPASSWORD only)."""
    url = make_url(sqlalchemy_url)
    args: list[str] = []
    env: dict[str, str] = {}
    host = url.query.get("host") or url.host
    if isinstance(host, tuple):
        host = host[0]
    if host:
        args += ["--host", str(host)]
    if url.port:
        args += ["--port", str(url.port)]
    if url.username:
        args += ["--username", url.username]
    if url.database:
        args += ["--dbname", url.database]
    if url.password:
        env["PGPASSWORD"] = str(url.password)
    return args, env


def prune(blob: BlobStore, *, now: datetime, retention_days: int = RETENTION_DAYS) -> int:
    cutoff = now - timedelta(days=retention_days)
    removed = 0
    for info in blob.list_blobs(CONTAINER, prefix="kloudrecon-"):
        if info.last_modified < cutoff:
            blob.delete(CONTAINER, info.name)
            removed += 1
    return removed


def run_backup(settings: Settings, blob: BlobStore) -> str:
    pg_dump = shutil.which("pg_dump")
    if pg_dump is None:
        raise RuntimeError("pg_dump not found (install postgresql-client)")
    now = datetime.now(UTC)
    name = f"kloudrecon-{now:%Y%m%d-%H%M%S}.dump"
    args, extra_env = libpq_args(settings.migration_url)
    started = time.perf_counter()
    with tempfile.TemporaryDirectory(prefix="kloudrecon-backup-") as tmp:
        target = Path(tmp) / name
        env = {**os.environ, **extra_env}
        subprocess.run(  # noqa: S603 - fixed binary, arguments built from settings
            [pg_dump, "--format=custom", "--no-owner", "--file", str(target), *args],
            check=True,
            env=env,
            capture_output=True,
            timeout=3600,
        )
        size = target.stat().st_size
        blob.upload_bytes(
            CONTAINER, name, target.read_bytes(), content_type="application/octet-stream"
        )
    removed = prune(blob, now=now)
    seconds = round(time.perf_counter() - started, 1)
    log.info("backup_done", blob=f"{CONTAINER}/{name}", bytes=size, seconds=seconds, pruned=removed)
    track_event("db_backup", {"bytes": size, "seconds": seconds, "pruned": removed})
    return name


def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_format)
    setup_telemetry(settings, "kloudrecon-backup")
    try:
        run_backup(settings, build_blob_store(settings))
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or b"").decode("utf-8", "replace")[-2000:]
        log.error("backup_failed", error="pg_dump failed", stderr=stderr)
        track_event("db_backup_failed", {"error": "pg_dump failed"})
        sys.exit(1)
    except Exception as exc:
        log.error("backup_failed", error=f"{type(exc).__name__}: {exc}")
        track_event("db_backup_failed", {"error": type(exc).__name__})
        sys.exit(1)


if __name__ == "__main__":
    main()

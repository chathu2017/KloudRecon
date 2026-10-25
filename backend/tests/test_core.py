from __future__ import annotations

import logging
from io import StringIO

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine

from kloudrecon.api.main import create_app
from kloudrecon.core.config import Settings
from kloudrecon.core.logging import REDACTED, configure_logging, redact, redact_value
from kloudrecon.domain.models import Base
from kloudrecon.services.infra.secrets import LocalSecretStore, validate_secret_name
from tests.conftest import ADMIN_URL


def test_health_endpoint() -> None:
    client = TestClient(create_app(start_listener=False))
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["env"] == "test"
    assert resp.headers["x-request-id"]


def test_ready_endpoint_reports_database_and_queue() -> None:
    client = TestClient(create_app(start_listener=False))
    resp = client.get("/api/v1/health/ready")
    assert resp.status_code == 200
    body = resp.json()
    assert body["database"] is True
    assert body["jobs"]["queued"] == 0


def test_unknown_route_uses_error_envelope() -> None:
    client = TestClient(create_app(start_listener=False))
    resp = client.get("/api/v1/does-not-exist")
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"


def test_prod_refuses_dev_auth() -> None:
    with pytest.raises(ValidationError, match="AUTH_MODE=dev"):
        Settings(env="prod", auth_mode="dev", secret_store="keyvault")


def test_prod_refuses_local_secret_store() -> None:
    with pytest.raises(ValidationError, match="SECRET_STORE"):
        Settings(env="prod", auth_mode="entra", secret_store="local")


@pytest.mark.parametrize(
    ("value", "leak"),
    [
        ("Authorization: Bearer abcdefghijklmnopqrstuvwxyz", "abcdefghijklmnop"),
        (
            "token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N",
            "dozjgNryP4J3jVmNHl0w5N",
        ),
        ("DefaultEndpointsProtocol=http;AccountKey=c2VjcmV0a2V5;BlobEndpoint=x", "c2VjcmV0a2V5"),
        ("https://x.blob.core.windows.net/c/b?sv=1&sig=SIGNATUREVALUE", "SIGNATUREVALUE"),
        ("postgresql://user:hunter2@localhost/db", "hunter2"),
        # Phase 5: free-text key=value secrets, billing keys, webhook URLs and signing secrets
        ("SMTP login failed: password=hunter2 for user x", "hunter2"),
        ("config client_secret: kr~Abc.123_secret-value", "kr~Abc.123_secret-value"),
        ("Stripe rejected sk_live_51HxYZabcdEFGH1234 (401)", "51HxYZabcdEFGH1234"),
        ("verify with whsec_4eC39HqLyjWDarjtT1zdp7dc", "4eC39HqLyjWDarjtT1zdp7dc"),
        ("paddle key pdl_live_apikey_01abcdef0123456789", "01abcdef0123456789"),
        (
            "POST https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXXXXXX failed",
            "XXXXXXXXXXXXXXXX",
        ),
        (
            "POST https://contoso.webhook.office.com/webhookb2/abc@def/IncomingWebhook/123/456",
            "IncomingWebhook/123/456",
        ),
    ],
)
def test_redact_value_masks_tokens(value: str, leak: str) -> None:
    out = redact_value(value)
    assert leak not in out
    assert REDACTED in out


def test_redact_nested_sensitive_keys() -> None:
    data = {"client_secret": "s3cr3t", "nested": {"password": "p", "ok": "fine"}, "list": ["x"]}
    out = redact(data)
    assert out["client_secret"] == REDACTED
    assert out["nested"]["password"] == REDACTED
    assert out["nested"]["ok"] == "fine"


def test_logs_never_contain_secrets() -> None:
    configure_logging("INFO", "json")
    stream = StringIO()
    handler = logging.getLogger().handlers[0]
    original = handler.stream  # type: ignore[attr-defined]
    handler.stream = stream  # type: ignore[attr-defined]
    try:
        from kloudrecon.core.logging import get_logger

        get_logger("test").info(
            "saving_connection", client_secret="VERY-SECRET-VALUE", note="Bearer abcdefghijklmnop"
        )
        logging.getLogger("stdlib").info("url postgresql://u:topsecretpw@h/db")
    finally:
        handler.stream = original  # type: ignore[attr-defined]
    output = stream.getvalue()
    assert "VERY-SECRET-VALUE" not in output
    assert "abcdefghijklmnop" not in output
    assert "topsecretpw" not in output
    assert "saving_connection" in output


def test_local_secret_store_roundtrip(tmp_path: object) -> None:
    from pathlib import Path

    assert isinstance(tmp_path, Path)
    store = LocalSecretStore(tmp_path)
    store.set_secret("conn-abc", "value-1")
    assert store.get_secret("conn-abc") == "value-1"
    raw = (tmp_path / "secrets.json").read_text()
    assert "value-1" not in raw  # encrypted at rest
    store.delete_secret("conn-abc")
    assert store.get_secret("conn-abc") is None


def test_secret_name_validation() -> None:
    with pytest.raises(ValueError, match="secret name"):
        validate_secret_name("bad_name!")


def _not_a_partition(
    obj: object, name: str | None, type_: str, reflected: bool, other: object
) -> bool:
    """cost_daily partitions are created at run time (decision 0027), not by the models."""
    table = getattr(obj, "table", obj)
    table_name = name if type_ == "table" else getattr(table, "name", "")
    return not str(table_name or "").startswith(("cost_daily_y", "cost_daily_default"))


def test_migrations_match_models() -> None:
    engine = create_engine(ADMIN_URL)
    with engine.connect() as conn:
        ctx = MigrationContext.configure(
            conn, opts={"compare_type": True, "include_object": _not_a_partition}
        )
        diff = compare_metadata(ctx, Base.metadata)
    engine.dispose()
    assert diff == [], f"Models and migrations differ: {diff}"

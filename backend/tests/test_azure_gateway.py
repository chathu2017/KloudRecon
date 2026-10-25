"""RestAzureGateway against recorded fixtures: friendly sign-in errors, throttling, paging."""

from __future__ import annotations

import json

import httpx
import pytest

from kloudrecon.services.azure.errors import AzureAuthError, AzureForbidden
from kloudrecon.services.azure.fixtures import FixtureTransport, RecordingTransport, fake_jwt
from kloudrecon.services.azure.gateway import COUNT_QUERY, INVENTORY_QUERY
from kloudrecon.services.azure.rest import RestAzureGateway, retry_delay
from kloudrecon.services.azure.validation import is_read_only, validate
from tests.conftest import FIXTURES

SECRET = "kr~Sup3r-Secret.Value_0123456789"


def gateway(name: str, **kwargs: object) -> tuple[RestAzureGateway, FixtureTransport]:
    transport = FixtureTransport.from_file(FIXTURES / f"{name}.json")
    sleeps: list[float] = []
    gw = RestAzureGateway(
        tenant_id="22222222-bbbb-4ccc-8ddd-000000000000",
        client_id="33333333-cccc-4ddd-8eee-000000000000",
        client_secret=SECRET,
        transport=transport,
        sleep=sleeps.append,
        **kwargs,  # type: ignore[arg-type]
    )
    gw.sleeps = sleeps  # type: ignore[attr-defined]
    return gw, transport


@pytest.mark.parametrize(
    ("fixture", "code", "phrase"),
    [
        ("bad_secret", "invalid_secret", "secret ID instead of the secret Value"),
        ("expired_secret", "secret_expired", "has expired"),
        ("app_not_found", "app_not_found", "Client ID"),
        ("tenant_not_found", "tenant_not_found", "tenant) ID was not found"),
    ],
)
def test_token_errors_are_friendly(fixture: str, code: str, phrase: str) -> None:
    gw, _ = gateway(fixture)
    with pytest.raises(AzureAuthError) as info:
        gw.token()
    assert info.value.code == code
    assert phrase in info.value.message
    assert SECRET not in json.dumps(info.value.to_dict())


def test_token_request_sends_secret_only_in_form_body() -> None:
    gw, transport = gateway("valid_reader")
    gw.token()
    request = transport.requests[0]
    assert "client_credentials" in request.content.decode()
    assert SECRET not in str(request.url)
    assert SECRET not in repr(gw)
    # later API calls never carry it
    gw.list_subscriptions()
    assert all(SECRET not in r.content.decode() for r in transport.requests[1:])


def test_throttling_honors_retry_after_and_counts() -> None:
    gw, _ = gateway("throttled")
    rows = list(gw.resource_graph(COUNT_QUERY, ["sub"]))
    assert rows == [{"count_": 42}]
    assert gw.stats.throttled == 2
    assert gw.sleeps == [2.0, 2.0]  # type: ignore[attr-defined]


def test_retry_delay_parses_reset_headers() -> None:
    response = httpx.Response(
        429, headers={"x-ms-ratelimit-microsoft.resourcegraph-quota-resets-after": "00:00:05"}
    )
    assert retry_delay(response, 1) == 5.0
    assert 1.0 <= retry_delay(None, 1) <= 2.0


def test_forbidden_maps_to_azure_forbidden() -> None:
    gw, _ = gateway("valid_reader")
    with pytest.raises(AzureForbidden):
        gw.list_management_groups()


def test_resource_graph_follows_skip_token() -> None:
    page1 = {"totalRecords": 3, "count": 2, "data": [{"id": "a"}, {"id": "b"}], "$skipToken": "t"}
    page2 = {"totalRecords": 3, "count": 1, "data": [{"id": "c"}]}
    transport = FixtureTransport.from_list(
        [
            {"method": "POST", "url": "oauth2", "json": "$fake_jwt"},
            {"method": "POST", "url": "ResourceGraph", "json": page1, "times": 1},
            {"method": "POST", "url": "ResourceGraph", "json": page2},
        ]
    )
    gw = RestAzureGateway(
        tenant_id="t",
        client_id="c",
        client_secret=SECRET,
        transport=transport,
        sleep=lambda _: None,
    )
    rows = list(gw.resource_graph(INVENTORY_QUERY, ["s1"], page_size=2))
    assert [r["id"] for r in rows] == ["a", "b", "c"]
    second = json.loads(transport.requests[2].content)
    assert second["options"]["$skipToken"] == "t"


def test_activity_log_follows_next_link() -> None:
    transport = FixtureTransport.from_list(
        [
            {"method": "POST", "url": "oauth2", "json": "$fake_jwt"},
            {
                "method": "GET",
                "url": "eventtypes/management/values\\?api-version",
                "json": {
                    "value": [{"eventDataId": "1"}],
                    "nextLink": "https://management.azure.com/next?page=2",
                },
            },
            {"method": "GET", "url": "next\\?page=2", "json": {"value": [{"eventDataId": "2"}]}},
        ]
    )
    gw = RestAzureGateway(
        tenant_id="t",
        client_id="c",
        client_secret=SECRET,
        transport=transport,
        sleep=lambda _: None,
    )
    from datetime import UTC, datetime, timedelta

    now = datetime.now(UTC)
    events = list(gw.activity_log("sub", now - timedelta(days=1), now))
    assert [e["eventDataId"] for e in events] == ["1", "2"]


def test_is_read_only() -> None:
    assert is_read_only([{"actions": ["*/read"], "notActions": []}])[:2] == (True, False)
    can_read, can_write, writes = is_read_only(
        [{"actions": ["*"], "notActions": ["Microsoft.Authorization/*/Write"]}]
    )
    assert can_read
    assert can_write
    assert writes == ["*"]


def test_validate_reader_is_partially_valid_when_cost_unsupported() -> None:
    gw, _ = gateway("valid_reader")
    report = validate(gw, scope={"type": "all"}, tiers={"core": True})
    status = {c.key: c.status for c in report.checks}
    assert status["sign_in"] == "pass"
    assert status["subscriptions"] == "pass"
    assert status["permissions"] == "pass"
    assert status["resource_graph"] == "pass"
    assert status["cost"] == "warn"
    assert status["defender"] == "pass"
    assert report.status == "partially_valid"
    cost = next(c for c in report.checks if c.key == "cost")
    assert "does not support the Cost Management API" in cost.message


def test_validate_selected_subscription_scope_reports_missing() -> None:
    gw, _ = gateway("valid_all_green")
    report = validate(
        gw,
        scope={
            "type": "subscriptions",
            "subscription_ids": [
                "11111111-aaaa-4bbb-8ccc-000000000001",
                "99999999-aaaa-4bbb-8ccc-000000000009",
            ],
        },
        tiers={"core": True},
    )
    subs = next(c for c in report.checks if c.key == "subscriptions")
    assert subs.status == "warn"
    assert "Not visible" in subs.message
    assert len(report.subscriptions) == 1


def test_recording_transport_strips_tokens_and_secrets() -> None:
    token = fake_jwt({"roles": ["User.Read.All"], "upn": "someone@contoso.example"})

    class Inner(httpx.BaseTransport):
        def handle_request(self, request: httpx.Request) -> httpx.Response:
            if "oauth2" in str(request.url):
                return httpx.Response(200, json={"access_token": token, "expires_in": 3599})
            return httpx.Response(
                200, json={"value": [{"name": "x", "properties": {"client_secret": "leak"}}]}
            )

    rec = RecordingTransport(Inner())
    gw = RestAzureGateway(tenant_id="t", client_id="c", client_secret=SECRET, transport=rec)
    gw.list_subscriptions()
    dumped = json.dumps(rec.recorded)
    assert SECRET not in dumped
    assert token not in dumped
    assert "leak" not in dumped
    assert "someone@contoso.example" not in dumped
    assert rec.recorded[0]["json"]["access_token"] == {"roles": ["User.Read.All"]}

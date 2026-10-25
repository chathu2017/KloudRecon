"""FinOps engines without a database: forecast, anomalies, cost parsing, SKUs and prices."""

from __future__ import annotations

import random
from datetime import date, timedelta
from typing import Any

import pytest

from kloudrecon.finops import anomalies, costdata, prices, skus
from kloudrecon.finops import forecast as fc

END = date(2026, 9, 26)


def _series(days: int = 400, spike: tuple[int, ...] = (), noise: float = 0.06) -> dict[date, float]:
    rng = random.Random(7)
    out: dict[date, float] = {}
    for i in range(days):
        d = END - timedelta(days=days - 1 - i)
        v = 1200 * (1.0003**i) * (0.85 if d.weekday() >= 5 else 1.0)
        v *= 1 - noise / 2 + noise * rng.random()
        if (END - d).days in spike:
            v += 900
        out[d] = v
    return out


# ---- forecast -----------------------------------------------------------------------------------
def test_ets_forecast_has_ordered_bands_and_weekly_shape() -> None:
    points = _series()
    horizon = fc.horizon_to(END, 3)
    result = fc.forecast_daily(points, horizon)
    assert result.method == "ets"
    assert result.dates[0] == END + timedelta(days=1)
    assert len(result.dates) == horizon
    for lo, mid, hi in zip(result.p10, result.p50, result.p90, strict=True):
        assert 0 <= lo <= mid <= hi
    weekend = [v for d, v in zip(result.dates, result.p50, strict=True) if d.weekday() >= 5]
    weekday = [v for d, v in zip(result.dates, result.p50, strict=True) if d.weekday() < 5]
    assert sum(weekend) / len(weekend) < 0.95 * sum(weekday) / len(weekday)


def test_short_history_uses_seasonal_naive() -> None:
    points = {d: v for d, v in _series().items() if d > END - timedelta(days=20)}
    result = fc.forecast_daily(points, 10)
    assert result.method == "seasonal_naive"
    assert all(
        lo <= mid <= hi for lo, mid, hi in zip(result.p10, result.p50, result.p90, strict=True)
    )


def test_backtest_accuracy_and_outlier_days() -> None:
    clean = fc.backtest(_series(), END)
    assert clean.mape is not None
    assert clean.mape < 5
    spiky = fc.backtest(_series(spike=(5, 6, 7)), END)
    assert spiky.outlier_days == 3
    assert spiky.mape is not None
    assert spiky.mape_typical is not None
    assert spiky.mape_typical < spiky.mape
    assert len(spiky.points) == 30


def test_blend_moves_p50_toward_azure_and_keeps_width() -> None:
    base = fc.DailyForecast([END + timedelta(days=1)], [90.0], [100.0], [110.0], "ets")
    out = fc.blend(base, {END + timedelta(days=1): 200.0})
    assert out.p50[0] == pytest.approx(100 * 0.65 + 200 * 0.35)
    assert out.p90[0] - out.p10[0] == pytest.approx(20.0)
    assert fc.blend(base, {}) is base


def test_month_end_and_monthly_projection() -> None:
    points = _series()
    result = fc.forecast_daily(points, fc.horizon_to(END, 3))
    month = fc.month_end(points, result, END)
    mtd = sum(v for d, v in points.items() if d >= END.replace(day=1))
    assert month["mtd"] == pytest.approx(mtd, rel=1e-6)
    assert month["p10"] <= month["p50"] <= month["p90"]
    months = fc.monthly_projection(result, 3, after=END)
    assert [m["month"] for m in months] == ["2026-10", "2026-11", "2026-12"]
    assert fc.horizon_to(date(2026, 1, 31), 1) == 28


# ---- anomalies ----------------------------------------------------------------------------------
def test_anomaly_detection_merges_days_and_ignores_weekends() -> None:
    points = _series(spike=(10, 11, 12))
    spikes = anomalies.detect(points, since=END - timedelta(days=90))
    assert len(spikes) == 1
    s = spikes[0]
    assert s.days == 3
    assert s.start == END - timedelta(days=12)
    assert s.delta == pytest.approx(2700, rel=0.15)
    assert anomalies.detect(_series(), since=END - timedelta(days=90)) == []


def test_anomaly_root_cause_tree() -> None:
    spike = anomalies.Spike(END, END, 100.0, 1100.0)
    rows: list[anomalies.Row] = []
    for w in range(0, 5):
        d = END - timedelta(days=7 * w)
        rows.append((d, "Storage", "/sub/st1", "Storage", 50.0))
        rows.append((d, "Storage", "/sub/st1", "Bandwidth", 5.0 + (900.0 if w == 0 else 0)))
        rows.append(
            (d, "Virtual Machines", "/sub/vm1", "Virtual Machines", 45.0 + (100 if w == 0 else 0))
        )
    tree = anomalies.explain(rows, spike, {"/sub/st1": "stexport"})
    assert tree["services"][0]["service"] == "Storage"
    top = tree["services"][0]["resources"][0]
    assert top["name"] == "stexport"
    assert top["meters"][0]["meter_category"] == "Bandwidth"
    assert "Bandwidth on stexport" in tree["headline"]


# ---- cost data ----------------------------------------------------------------------------------
def test_parse_cost_query_and_arm_ids() -> None:
    result: dict[str, Any] = {
        "columns": [
            {"name": "Cost"},
            {"name": "UsageDate"},
            {"name": "ResourceId"},
            {"name": "MeterCategory"},
            {"name": "Currency"},
        ],
        "rows": [
            [
                1.5,
                20260901,
                "/subscriptions/S/resourceGroups/RG/providers/Microsoft.Compute/disks/D1",
                "Storage",
                "EUR",
            ],
            [2.0, "2026-09-02T00:00:00", "", "Support", "EUR"],
        ],
    }
    rows = costdata.parse_query(result)
    assert rows[0]["date"] == date(2026, 9, 1)
    assert rows[0]["arm_id"].endswith("/disks/d1")
    assert rows[0]["currency"] == "EUR"
    assert rows[1]["date"] == date(2026, 9, 2)
    parts = costdata.parse_arm(
        "/subscriptions/s1/resourcegroups/rg1/providers/microsoft.sql/servers/sql1/databases/db1"
    )
    assert parts["type"] == "microsoft.sql/servers/databases"
    assert parts["name"] == "db1"
    assert parts["resource_group"] == "rg1"
    assert costdata.service_for("microsoft.containerservice/managedclusters", "x") == (
        "Azure Kubernetes Service"
    )
    assert costdata.service_for("", "Support") == "Support"
    chunks = costdata.month_chunks(date(2025, 12, 15), date(2026, 2, 3))
    assert chunks == [
        (date(2025, 12, 15), date(2025, 12, 31)),
        (date(2026, 1, 1), date(2026, 1, 31)),
        (date(2026, 2, 1), date(2026, 2, 3)),
    ]


# ---- SKUs & prices ------------------------------------------------------------------------------
def test_vm_size_ladder() -> None:
    size = skus.parse_vm("Standard_D16s_v5")
    assert size is not None
    assert size.vcpus == 16
    assert size.memory_gib == 64
    down = skus.smaller(size, steps=2)
    assert down is not None
    assert down.name == "Standard_D4s_v5"
    assert skus.smaller(skus.parse_vm("Standard_D2s_v5"), 1) is None  # type: ignore[arg-type]
    assert skus.parse_vm("Standard_B2ms") is not None
    assert skus.parse_vm("weird") is None


def test_catalog_prices() -> None:
    q = prices.catalog_vm("Standard_D4s_v5", "eastus")
    assert q.hourly == pytest.approx(0.192)
    assert q.monthly == pytest.approx(140.16)
    win = prices.catalog_vm("Standard_D4s_v5", "eastus", windows=True)
    assert win.hourly == pytest.approx(0.192 + 4 * 0.046)
    ri = prices.catalog_vm("Standard_D4s_v5", "eastus", term="1y")
    assert ri.hourly == pytest.approx(0.192 * 0.62)
    weu = prices.catalog_vm("Standard_D4s_v5", "westeurope")
    assert weu.hourly == pytest.approx(0.192 * 1.15)


RETAIL_ITEMS = [
    {
        "productName": "Virtual Machines Dsv5 Series Windows",
        "meterName": "D4s v5",
        "type": "Consumption",
        "unitPrice": 0.376,
    },
    {
        "productName": "Virtual Machines Dsv5 Series",
        "meterName": "D4s v5",
        "type": "Consumption",
        "unitPrice": 0.2,
    },
    {
        "productName": "Virtual Machines Dsv5 Series",
        "meterName": "D4s v5 Spot",
        "type": "Consumption",
        "unitPrice": 0.04,
    },
    {
        "productName": "Virtual Machines Dsv5 Series",
        "meterName": "D4s v5",
        "type": "DevTestConsumption",
        "unitPrice": 0.1,
    },
    {
        "productName": "Virtual Machines Dsv5 Series",
        "meterName": "D4s v5",
        "type": "Reservation",
        "reservationTerm": "1 Year",
        "unitPrice": 1038.0,
    },
    {
        "productName": "Virtual Machines Dsv5 Series",
        "meterName": "D4s v5",
        "type": "Reservation",
        "reservationTerm": "3 Years",
        "unitPrice": 1993.0,
    },
]


def test_retail_prices_are_parsed_and_cached() -> None:
    calls: list[str] = []

    def fetch(expr: str) -> list[dict[str, Any]]:
        calls.append(expr)
        return RETAIL_ITEMS

    prices.PriceBook.clear_memory()
    book = prices.PriceBook(mode="retail", fetcher=fetch)
    book._from_db = lambda key: None  # type: ignore[method-assign]
    book._to_db = lambda key, p: None  # type: ignore[method-assign]
    payg = book.vm("Standard_D4s_v5", "eastus")
    assert payg.source == "retail"
    assert payg.hourly == pytest.approx(0.2)
    assert book.vm("Standard_D4s_v5", "eastus", windows=True).hourly == pytest.approx(0.376)
    assert book.vm("Standard_D4s_v5", "eastus", term="1y").hourly == pytest.approx(
        1038 / 8760, rel=1e-4
    )
    three = book.vm("Standard_D4s_v5", "eastus", term="3y", windows=True)
    assert three.hourly == pytest.approx(1993 / 26280 + 0.176, rel=1e-4)
    assert len(calls) == 1
    assert "armSkuName eq 'Standard_D4s_v5'" in calls[0]
    prices.PriceBook.clear_memory()


def test_retail_failure_falls_back_to_catalog() -> None:
    def broken(expr: str) -> list[dict[str, Any]]:
        raise OSError("offline")

    prices.PriceBook.clear_memory()
    book = prices.PriceBook(mode="retail", fetcher=broken)
    book._from_db = lambda key: None  # type: ignore[method-assign]
    q = book.vm("Standard_E8s_v5", "northeurope")
    assert q.source == "catalog"
    assert q.hourly == pytest.approx(0.063 * 8 * 1.07)
    assert prices.PriceBook(mode="static").vm("Standard_E8s_v5", "eastus").source == "catalog"
    prices.PriceBook.clear_memory()


def test_reservations_skip_capacity_left_on_existing_orders() -> None:
    from kloudrecon.finops import commitments

    book = prices.PriceBook(mode="static")
    instances = [
        commitments.Instance(f"/vm{i}", f"vm{i}", "Standard_D8s_v5", "eastus", 1, 30, False)
        for i in range(10)
    ]
    spare = commitments.spare_capacity(
        [{"sku": "Standard_D8s_v5", "quantity": 8, "utilization_avg": 50.0}]
    )
    assert spare == {"standard_d8s_v5": 4.0}
    recs = commitments.reservation_recs(instances, book, spare)
    one = next(r for r in recs if r.term == "1y")
    assert one.quantity == 6
    assert any("unused capacity" in n for n in one.notes)
    assert one.break_even_months == pytest.approx(12 * 0.62, abs=0.05)
    none = commitments.reservation_recs(instances[:3], book, spare)
    assert none == []

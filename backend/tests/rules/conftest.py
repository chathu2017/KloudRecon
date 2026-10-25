"""Rule tests are pure Python: skip the database setup and per-test truncation."""

from __future__ import annotations

import pytest


@pytest.fixture(scope="session")
def _database() -> None:
    return None


@pytest.fixture(autouse=True)
def _clean_tables() -> None:
    return None

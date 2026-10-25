"""Operating systems a server can be registered as, with the package family that decides which
patch commands the Linux script runs and the end of vendor support used by the analysis.

Dates are the end of standard (security) support as published by each vendor; they were entered
by hand and should be re-checked from time to time.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class OsVersion:
    key: str
    label: str
    end_of_support: date | None


@dataclass(frozen=True)
class OsFamily:
    key: str
    label: str
    platform: str  # windows | linux
    packages: str  # windows | apt | rpm | zypper
    versions: tuple[OsVersion, ...]


def _v(key: str, label: str, end: str | None) -> OsVersion:
    return OsVersion(key, label, date.fromisoformat(end) if end else None)


FAMILIES: tuple[OsFamily, ...] = (
    OsFamily(
        "windows-server",
        "Windows Server",
        "windows",
        "windows",
        (
            _v("2025", "Windows Server 2025", "2034-10-10"),
            _v("2022", "Windows Server 2022", "2031-10-14"),
            _v("2019", "Windows Server 2019", "2029-01-09"),
            _v("2016", "Windows Server 2016", "2027-01-12"),
            _v("2012r2", "Windows Server 2012 R2", "2023-10-10"),
            _v("2012", "Windows Server 2012", "2023-10-10"),
            _v("other", "Other Windows version", None),
        ),
    ),
    OsFamily(
        "ubuntu",
        "Ubuntu",
        "linux",
        "apt",
        (
            _v("24.04", "Ubuntu 24.04 LTS", "2029-04-30"),
            _v("22.04", "Ubuntu 22.04 LTS", "2027-04-30"),
            _v("20.04", "Ubuntu 20.04 LTS", "2025-05-31"),
            _v("18.04", "Ubuntu 18.04 LTS", "2023-05-31"),
            _v("16.04", "Ubuntu 16.04 LTS", "2021-04-30"),
        ),
    ),
    OsFamily(
        "debian",
        "Debian",
        "linux",
        "apt",
        (
            _v("12", "Debian 12 (bookworm)", "2028-06-30"),
            _v("11", "Debian 11 (bullseye)", "2026-08-31"),
            _v("10", "Debian 10 (buster)", "2024-06-30"),
        ),
    ),
    OsFamily(
        "rhel",
        "Red Hat Enterprise Linux",
        "linux",
        "rpm",
        (
            _v("9", "RHEL 9", "2032-05-31"),
            _v("8", "RHEL 8", "2029-05-31"),
            _v("7", "RHEL 7", "2024-06-30"),
        ),
    ),
    OsFamily(
        "centos",
        "CentOS",
        "linux",
        "rpm",
        (
            _v("stream9", "CentOS Stream 9", "2027-05-31"),
            _v("stream8", "CentOS Stream 8", "2024-05-31"),
            _v("8", "CentOS Linux 8", "2021-12-31"),
            _v("7", "CentOS Linux 7", "2024-06-30"),
        ),
    ),
    OsFamily(
        "rocky",
        "Rocky Linux",
        "linux",
        "rpm",
        (_v("9", "Rocky Linux 9", "2032-05-31"), _v("8", "Rocky Linux 8", "2029-05-31")),
    ),
    OsFamily(
        "almalinux",
        "AlmaLinux",
        "linux",
        "rpm",
        (_v("9", "AlmaLinux 9", "2032-05-31"), _v("8", "AlmaLinux 8", "2029-05-31")),
    ),
    OsFamily(
        "oracle",
        "Oracle Linux",
        "linux",
        "rpm",
        (
            _v("9", "Oracle Linux 9", "2032-06-30"),
            _v("8", "Oracle Linux 8", "2029-07-31"),
            _v("7", "Oracle Linux 7", "2024-12-31"),
        ),
    ),
    OsFamily(
        "amazon",
        "Amazon Linux",
        "linux",
        "rpm",
        (_v("2023", "Amazon Linux 2023", "2029-06-30"), _v("2", "Amazon Linux 2", "2026-06-30")),
    ),
    OsFamily(
        "sles",
        "SUSE Linux Enterprise Server",
        "linux",
        "zypper",
        (_v("15", "SLES 15", "2031-07-31"), _v("12", "SLES 12", "2024-10-31")),
    ),
    OsFamily(
        "opensuse",
        "openSUSE Leap",
        "linux",
        "zypper",
        (
            _v("15.6", "openSUSE Leap 15.6", "2025-12-31"),
            _v("15.5", "openSUSE Leap 15.5", "2024-12-31"),
        ),
    ),
    OsFamily(
        "other-linux",
        "Other Linux",
        "linux",
        "auto",
        (_v("other", "Other distribution (the script detects the package manager)", None),),
    ),
)
BY_KEY = {f.key: f for f in FAMILIES}


def family(key: str) -> OsFamily | None:
    return BY_KEY.get(key)


def version(family_key: str, version_key: str) -> OsVersion | None:
    fam = BY_KEY.get(family_key)
    return next((v for v in fam.versions if v.key == version_key), None) if fam else None


def options(platform: str) -> list[dict[str, object]]:
    return [
        {
            "key": f.key,
            "label": f.label,
            "versions": [
                {
                    "key": v.key,
                    "label": v.label,
                    "end_of_support": v.end_of_support.isoformat() if v.end_of_support else None,
                }
                for v in f.versions
            ],
        }
        for f in FAMILIES
        if f.platform == platform
    ]

# 0054 — Server health checks from pasted script output

Date: 2026-10-04

## Context

KloudRecon sees Azure from the outside (read-only control plane). The owner asked for a health
check of what is inside a server: disks, memory, kernel, earlier errors and warnings, patches and
vulnerabilities, for Windows and Linux, with an enterprise-level report as Word, on its own or as
part of the audit report.

KloudRecon must stay read-only and agentless, so it cannot log on to servers.

## Decision

A new module, **Server health** (Operate → Server health, `/app/server-health`), with two tabs:
Windows servers and Linux servers.

- **Servers by name.** A customer adds a server with a plain name and its operating system
  (Windows Server version; Linux distribution and version from `health/catalog.py`: Ubuntu,
  Debian, RHEL, CentOS, Rocky, AlmaLinux, Oracle, Amazon Linux, SLES, openSUSE, other).
- **Collection script.** Each server gets a read-only script (`health/scripts/windows.ps1`,
  PowerShell 5.1; `health/scripts/linux.sh`, Bash, with the patch commands of the chosen package
  family: apt, dnf/yum or zypper). The admin runs it on the server; it prints one JSON document.
  It changes nothing, sends nothing and collects no passwords, files, environment variables or
  command lines (process names only).
- **Pasted output.** The admin pastes the output into KloudRecon. It is untrusted input: parsed
  as JSON (anything around the JSON is ignored), capped at 1.5 MB, never executed. Linux sections
  are raw command output inside JSON strings and are parsed on our side
  (`health/analyze.py`), which is far more robust than building structured JSON in Bash.
- **Health report.** Capacity (CPU, memory, swap, every disk, inodes), operating system and its
  end of vendor support, uptime, patching (pending updates with classification, last update,
  restart pending), vulnerabilities (the CVEs and advisories that the pending updates fix, as
  named by the server's own update service), errors and warnings of the last 7 days, failed
  services, security settings (firewall, antivirus, SMBv1, RDP NLA, old TLS, SSH root and password
  sign-in, SELinux/AppArmor, UID 0 and empty-password accounts, clock, local administrators,
  expiring certificates) and listening ports. Each finding has a severity and a recommendation.
  Score = 100 − 25/12/5/2 per critical/high/medium/low finding. Status: critical with any
  critical finding, at risk below 60, needs attention below 85 or with any high finding, else
  healthy. A check run without administrator/root rights is marked partial.
- **Storage.** Tables `servers` and `server_checks` (migration 0015, RLS like every tenant
  table). The last 20 checks per server are kept; the stored copy of the raw output is trimmed
  to 400 kB.
- **Reports.** New report type `server_health` (Word, same cover / approval page / contents as
  the audit report): executive summary, scope and method, findings across all servers, one chapter
  per server, recommendations grouped by action, glossary. It needs no Azure scan. The audit
  report has an option "Include server health checks" that adds one section.

## Checked

The Linux script was run in Ubuntu 22.04, Debian 12 and Rocky Linux 9 containers and the Windows
script on Windows 11 with Windows PowerShell 5.1; their real outputs were analysed and turned into
reports. openSUSE could not be verified live (the container's repositories were unreachable): its
patch table parsing is covered by a unit test from the documented format, and unreachable
repositories are reported as "unknown", not as "nothing to patch".

## Consequences

- The report is only as fresh as the last pasted output; nothing is collected automatically.
- End-of-support dates in `health/catalog.py` were entered by hand and need periodic review.
- Vulnerabilities are limited to what the operating system's update service names; a server that
  cannot reach its repositories shows an unknown patch state.

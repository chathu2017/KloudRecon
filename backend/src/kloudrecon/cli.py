"""KloudRecon CLI: `python -m kloudrecon.cli <command>`."""

from __future__ import annotations

import json
from pathlib import Path

import typer

from kloudrecon.core.db import session_scope
from kloudrecon.services import seed

app = typer.Typer(help="KloudRecon maintenance commands.", no_args_is_help=True)


@app.command("seed-dev")
def seed_dev() -> None:
    """Plans + dev users (owner@local.test, admin@acme.test, pending@new.test)."""
    from kloudrecon.core.config import get_settings

    if get_settings().is_prod:
        raise typer.BadParameter("seed-dev is not allowed when ENV=prod")
    with session_scope() as session:
        created = seed.seed_dev(session)
    typer.echo(f"Seeded plans and dev users. New users: {', '.join(created) or 'none'}")


@app.command("seed-plans")
def seed_plans() -> None:
    """Create the default plans if missing (safe in production)."""
    with session_scope() as session:
        created = seed.seed_plans(session)
    typer.echo(f"Plans created: {created}")


@app.command("seed-demo")
def seed_demo(
    reset: bool = typer.Option(False, "--reset", help="Delete and regenerate the demo data."),
) -> None:
    """Contoso Demo org + demo connection + 4 historical scans of the synthetic tenant."""
    from kloudrecon.services.demo import seed_demo_data

    result = seed_demo_data(reset=reset)
    if result.skipped:
        typer.echo("Contoso Demo already has scan data (use --reset to regenerate).")
    else:
        typer.echo(
            f"Contoso Demo seeded: {len(result.created_scans)} scans "
            f"({', '.join(result.statuses)})."
        )
    if result.users:
        typer.echo(f"Demo users created: {', '.join(result.users)}")


@app.command("demo-summary")
def demo_summary() -> None:
    """Print what the synthetic Contoso Demo tenant contains (plan Section 17)."""
    from kloudrecon.services.azure.demo.summary import summarize

    for key, value in summarize().items():
        typer.echo(f"{key:28} {value}")


@app.command("rules-check")
def rules_check(
    fixtures: Path = typer.Option(Path("tests/rules/fixtures"), help="Fixture directory."),
) -> None:
    """Fail when a rule has no pass/fail fixture, mapping or remediation (CI check)."""
    from kloudrecon.rules.engine import load_catalog
    from kloudrecon.rules.testing import check_catalog

    catalog = load_catalog()
    problems = check_catalog(fixtures, catalog)
    for problem in problems:
        typer.echo(f"  - {problem}", err=True)
    counts = {area: len(rules) for area, rules in sorted(catalog.by_area().items())}
    typer.echo(f"{len(catalog.rules)} rules: " + ", ".join(f"{k} {v}" for k, v in counts.items()))
    if problems:
        typer.echo(f"{len(problems)} problem(s).", err=True)
        raise typer.Exit(1)
    typer.echo("Rule catalog OK.")


@app.command("create-owner")
def create_owner(email: str) -> None:
    """Make EMAIL a Platform Owner (bound to the identity on first sign-in)."""
    with session_scope() as session:
        result = seed.create_owner(session, email)
    typer.echo(f"Platform owner {result}: {email.strip().lower()}")


@app.command("set-owner-password")
def set_owner_password(email: str) -> None:
    """Set the sign-in password of platform owner EMAIL (AUTH_MODE=local). The password is read
    from a hidden prompt, or from standard input when piped; never from the command line."""
    import sys

    from kloudrecon.services import local_auth

    if sys.stdin.isatty():
        password = typer.prompt("Password", hide_input=True, confirmation_prompt=True)
    else:
        password = sys.stdin.readline().strip()
    with session_scope() as session:
        result = seed.create_owner(session, email)
        local_auth.set_owner_password(session, email, password)
    typer.echo(f"Platform owner {result}, password set: {email.strip().lower()}")


@app.command("billing-secret")
def billing_secret(
    name: str = typer.Argument(
        help="stripe-api-key | stripe-webhook-secret | paddle-api-key | paddle-webhook-secret"
    ),
) -> None:
    """Store a billing provider key in the SecretStore (Key Vault in production). The value is
    read from a hidden prompt, never from the command line or the env file."""
    from kloudrecon.services.billing_providers import SECRET_NAMES
    from kloudrecon.services.infra import get_secret_store

    secret_name = f"billing-{name}"
    if secret_name not in SECRET_NAMES:
        raise typer.BadParameter(f"unknown secret {name!r}")
    value = typer.prompt("Value", hide_input=True).strip()
    if not value:
        raise typer.BadParameter("empty value")
    get_secret_store().set_secret(secret_name, value)
    typer.echo(f"Stored {secret_name} ({len(value)} characters).")


@app.command("export-openapi")
def export_openapi(path: Path = typer.Argument(Path("openapi.json"))) -> None:
    """Write the OpenAPI document (used by the web app's `npm run gen:api`)."""
    from kloudrecon.api.main import create_app

    spec = create_app(start_listener=False).openapi()
    path.write_text(json.dumps(spec, indent=2) + "\n", encoding="utf-8")
    typer.echo(f"Wrote {path}")


if __name__ == "__main__":
    app()

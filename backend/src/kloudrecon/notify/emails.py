"""Transactional email templates (HTML + plain text) with the KloudRecon look.

Values are HTML-escaped. Templates are code for now; the owner's template editor (Phase 5) will
override subject/body text per template name.
"""

# ruff: noqa: E501 -- email HTML needs long inline-styled lines
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from html import escape
from typing import Any

from kloudrecon.core.config import get_settings


@dataclass(frozen=True)
class RenderedEmail:
    subject: str
    html: str
    text: str


def _layout(title: str, paragraphs: list[str], cta: tuple[str, str] | None = None) -> str:
    body = "".join(
        f'<p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#141A3A">{p}</p>'
        for p in paragraphs
    )
    button = ""
    if cta:
        label, url = cta
        button = (
            f'<p style="margin:24px 0"><a href="{escape(url, quote=True)}" '
            'style="background:#3D4FE0;color:#FFFFFF;text-decoration:none;padding:10px 18px;'
            f'border-radius:8px;font-size:14px;font-weight:600;display:inline-block">{escape(label)}'
            "</a></p>"
        )
    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#F2F4FB;font-family:Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4FB;padding:32px 0">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #DDE2F0;border-radius:8px">
<tr><td style="padding:24px 32px;border-bottom:1px solid #DDE2F0">
<span style="font-size:18px;font-weight:600;color:#141A3A">KloudRecon</span>
<span style="font-size:12px;color:#4A5273"> for Azure</span>
</td></tr>
<tr><td style="padding:28px 32px">
<h1 style="margin:0 0 16px;font-size:20px;line-height:28px;color:#141A3A">{escape(title)}</h1>
{body}{button}
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #DDE2F0;font-size:12px;color:#4A5273">
KloudRecon by KloudSchool · Recon your Azure. Secure it. Optimize it.<br>
This is an automated message from a no-reply address.
</td></tr>
</table></td></tr></table></body></html>"""


def _text(title: str, lines: list[str], cta: tuple[str, str] | None = None) -> str:
    out = [title, "", *lines]
    if cta:
        out += ["", f"{cta[0]}: {cta[1]}"]
    out += ["", "--", "KloudRecon by KloudSchool"]
    return "\n".join(out)


def _app(path: str) -> str:
    return get_settings().public_app_url.rstrip("/") + path


def _registration_received(ctx: dict[str, Any]) -> RenderedEmail:
    org, email = str(ctx.get("org_name", "")), str(ctx.get("email", ""))
    title = "New registration waiting for approval"
    lines = [
        f"{email} registered {org} and is waiting for your review.",
        f"Country: {ctx.get('country') or '—'} · Company size: {ctx.get('size') or '—'}",
    ]
    cta = ("Open approval queue", _app("/owner/approvals"))
    return RenderedEmail(
        subject=f"[KloudRecon] New registration: {org}",
        html=_layout(title, [escape(x) for x in lines], cta),
        text=_text(title, lines, cta),
    )


def _registration_submitted(ctx: dict[str, Any]) -> RenderedEmail:
    name = str(ctx.get("name") or "there")
    title = "We received your registration"
    lines = [
        f"Hi {name},",
        "Thanks for signing up for KloudRecon. Our team reviews every new account, usually "
        "within one business day. We will email you as soon as your account is approved.",
    ]
    return RenderedEmail(
        subject="Your KloudRecon registration is under review",
        html=_layout(title, [escape(x) for x in lines]),
        text=_text(title, lines),
    )


def _welcome(ctx: dict[str, Any]) -> RenderedEmail:
    name = str(ctx.get("name") or "there")
    plan = str(ctx.get("plan_name") or "")
    trial_days = ctx.get("trial_days")
    title = "Your KloudRecon account is approved"
    lines = [f"Hi {name},", "Good news — your account is active and ready to use."]
    if plan:
        extra = f" with a {trial_days}-day trial" if trial_days else ""
        lines.append(f"Plan: {plan}{extra}.")
    lines.append(
        "Next step: connect your Azure environment read-only. It takes about three minutes."
    )
    cta = ("Open KloudRecon", _app("/app"))
    return RenderedEmail(
        subject="Welcome to KloudRecon — your account is approved",
        html=_layout(title, [escape(x) for x in lines], cta),
        text=_text(title, lines, cta),
    )


def _rejected(ctx: dict[str, Any]) -> RenderedEmail:
    name = str(ctx.get("name") or "there")
    reason = str(ctx.get("reason") or "")
    title = "About your KloudRecon registration"
    lines = [
        f"Hi {name},",
        "Thank you for your interest in KloudRecon. We are not able to approve your account "
        "at this time.",
    ]
    if reason:
        lines.append(f"Reason: {reason}")
    lines.append("If you think this is a mistake, reply through the contact page on our website.")
    return RenderedEmail(
        subject="Your KloudRecon registration",
        html=_layout(title, [escape(x) for x in lines]),
        text=_text(title, lines),
    )


def _invitation(ctx: dict[str, Any]) -> RenderedEmail:
    org = str(ctx.get("org_name", ""))
    inviter = str(ctx.get("inviter", "A teammate"))
    role = str(ctx.get("role", "member"))
    title = f"You're invited to {org} on KloudRecon"
    lines = [
        f"{inviter} invited you to join {org} as {role}.",
        "The invitation expires in 7 days.",
    ]
    cta = ("Accept invitation", _app(f"/invite/{ctx.get('token', '')}"))
    return RenderedEmail(
        subject=f"Invitation to join {org} on KloudRecon",
        html=_layout(title, [escape(x) for x in lines], cta),
        text=_text(title, lines, cta),
    )


def _scan_completed(ctx: dict[str, Any]) -> RenderedEmail:
    conn = str(ctx.get("connection", "your Azure connection"))
    first = bool(ctx.get("first"))
    status = str(ctx.get("status", "succeeded"))
    title = "Your first KloudRecon scan is ready" if first else f"Scan finished: {conn}"
    lines = [
        f"KloudRecon finished scanning {conn}.",
        f"Resources: {ctx.get('resources', 0)} · Subscriptions: {ctx.get('subscriptions', 0)} · "
        f"Changes: {ctx.get('changes', 0)} (risky: {ctx.get('risky', 0)})",
    ]
    if status == "partial":
        lines.append(
            "Some optional steps could not run. Open the scan details to see why; the rest of "
            "the data is complete."
        )
    cta = ("Open overview", _app("/app"))
    return RenderedEmail(
        subject=f"[KloudRecon] {title}",
        html=_layout(title, [escape(x) for x in lines], cta),
        text=_text(title, lines, cta),
    )


def _scan_failed(ctx: dict[str, Any]) -> RenderedEmail:
    conn = str(ctx.get("connection", "your Azure connection"))
    title = f"Scan failed: {conn}"
    lines = [
        f"KloudRecon could not finish scanning {conn}.",
        f"Reason: {ctx.get('reason') or 'unknown error'}",
        "Open the connection to validate it again or replace the client secret.",
    ]
    cta = ("Open connection", _app(f"/app/settings/connections/{ctx.get('connection_id', '')}"))
    return RenderedEmail(
        subject=f"[KloudRecon] {title}",
        html=_layout(title, [escape(x) for x in lines], cta),
        text=_text(title, lines, cta),
    )


def _secret_expiring(ctx: dict[str, Any]) -> RenderedEmail:
    conn = str(ctx.get("connection", "your Azure connection"))
    days = int(ctx.get("days_left", 0))
    if days < 0:
        title = f"Client secret expired: {conn}"
        first = f"The client secret of {conn} expired {abs(days)} day(s) ago. Scans stop working."
    elif days == 0:
        title = f"Client secret expires today: {conn}"
        first = f"The client secret of {conn} expires today."
    else:
        title = f"Client secret expires in {days} day(s): {conn}"
        first = f"The client secret of {conn} expires on {ctx.get('expires_on', '')}."
    lines = [
        first,
        "Create a new secret in the app registration (Certificates & secrets), then use "
        "Replace secret in KloudRecon. It takes a minute.",
    ]
    cta = ("Replace secret", _app(f"/app/settings/connections/{ctx.get('connection_id', '')}"))
    return RenderedEmail(
        subject=f"[KloudRecon] {title}",
        html=_layout(title, [escape(x) for x in lines], cta),
        text=_text(title, lines, cta),
    )


def _risky_changes(ctx: dict[str, Any]) -> RenderedEmail:
    conn = str(ctx.get("connection", "your Azure connection"))
    count = int(ctx.get("count", 0))
    title = f"{count} risky change(s) in {conn}"
    lines = [f"The latest scan of {conn} found {count} risky change(s):"]
    lines += [f"• {item}" for item in list(ctx.get("items") or [])[:10]]
    cta = ("Review changes", _app("/app/changes?risky=1"))
    return RenderedEmail(
        subject=f"[KloudRecon] {title}",
        html=_layout(title, [escape(x) for x in lines], cta),
        text=_text(title, lines, cta),
    )


def _no_refs(text: str) -> str:
    """Citation markers like [F1] link inside the app; in email they are just noise."""
    import re

    return re.sub(r"\s?\[[A-Z]{1,2}\d{1,4}\]", "", text).strip()


def _weekly_digest(ctx: dict[str, Any]) -> RenderedEmail:
    d = dict(ctx.get("digest") or {})
    org = str(ctx.get("org_name", "your organization"))
    title = _no_refs(str(d.get("headline") or "Your weekly Azure summary"))
    subject = _no_refs(str(d.get("subject") or "KloudRecon weekly digest"))

    def items(key: str) -> list[tuple[str, str]]:
        return [
            (_no_refs(str(p.get("title", ""))), _no_refs(str(p.get("detail", ""))))
            for p in list(d.get(key) or [])[:6]
            if isinstance(p, dict)
        ]

    highlights, steps = items("highlights"), items("next_steps")
    html_parts = [f"Here is this week's summary for {escape(org)}."]
    if highlights:
        html_parts.append(
            "<strong>Highlights</strong><br>"
            + "<br>".join(f"• <strong>{escape(t)}</strong> {escape(x)}" for t, x in highlights)
        )
    if steps:
        html_parts.append(
            "<strong>Top priorities</strong><br>"
            + "<br>".join(f"{i}. {escape(t)} {escape(x)}" for i, (t, x) in enumerate(steps, 1))
        )
    html_parts.append(
        '<span style="color:#4A5273;font-size:12px">Generated from your latest scan. '
        "You can turn the digest off in Settings → AI or in your profile.</span>"
    )
    cta = ("Open KloudRecon", _app("/app"))
    lines = [f"Here is this week's summary for {org}.", ""]
    lines += ["Highlights:"] + [f"• {t} {x}".rstrip() for t, x in highlights]
    lines += ["", "Top priorities:"] + [
        f"{i}. {t} {x}".rstrip() for i, (t, x) in enumerate(steps, 1)
    ]
    return RenderedEmail(
        subject=f"[KloudRecon] {subject}",
        html=_layout(title, html_parts, cta),
        text=_text(title, lines, cta),
    )


def _report_ready(ctx: dict[str, Any]) -> RenderedEmail:
    title = str(ctx.get("title", "Your report"))
    org = str(ctx.get("org_name", "your organization"))
    freq = str(ctx.get("frequency", "scheduled"))
    lines = [
        f"Your {freq} report “{title}” for {org} is ready ({ctx.get('pages') or '—'} pages).",
        "The PDF is attached. You can also download it from Reports in KloudRecon.",
    ]
    cta = ("Open Reports", _app("/app/reports"))
    return RenderedEmail(
        subject=f"[KloudRecon] {title}",
        html=_layout(title, [escape(x) for x in lines], cta),
        text=_text(title, lines, cta),
    )


def _alert(ctx: dict[str, Any]) -> RenderedEmail:
    title = str(ctx.get("title", "KloudRecon alert"))
    org = str(ctx.get("org_name") or "your organization")
    event = str(ctx.get("event", "Alert"))
    lines = [f"{event} in {org}.", str(ctx.get("summary", ""))[:1000]]
    lines.append("You receive this because an alert rule in Settings → Alerts sends it by email.")
    link = str(ctx.get("link") or "/app")
    cta = ("Open in KloudRecon", _app(link if link.startswith("/app") else "/app"))
    return RenderedEmail(
        subject=f"[KloudRecon] {title}",
        html=_layout(title, [escape(x) for x in lines if x], cta),
        text=_text(title, [x for x in lines if x], cta),
    )


def _trial_notice(ctx: dict[str, Any]) -> RenderedEmail:
    title = str(ctx.get("title", "Your KloudRecon trial"))
    lines = [
        f"Organization: {ctx.get('org_name', '')}",
        str(ctx.get("body", "")),
        "Your scan history, findings and reports stay available.",
    ]
    cta = ("Choose a plan", _app("/app/settings/billing"))
    return RenderedEmail(
        subject=f"[KloudRecon] {title}",
        html=_layout(title, [escape(x) for x in lines if x], cta),
        text=_text(title, [x for x in lines if x], cta),
    )


def _login_code(ctx: dict[str, Any]) -> RenderedEmail:
    code, minutes = str(ctx.get("code", "")), int(ctx.get("minutes", 10))
    title = "Your KloudRecon sign-in code"
    shown = escape(f"{code[:3]} {code[3:]}")
    return RenderedEmail(
        subject=title,
        html=_layout(
            title,
            [
                "Enter this code to finish signing in:",
                '<span style="display:inline-block;font-size:32px;line-height:40px;font-weight:700;'
                "letter-spacing:6px;color:#141A3A;background:#E8EBFD;border-radius:8px;"
                f'padding:12px 20px">{shown}</span>',
                f"The code works once and expires in {minutes} minutes.",
                "If you did not try to sign in, you can ignore this email. Nobody can sign in "
                "without the code, and KloudRecon will never ask you for it by phone or chat.",
            ],
        ),
        text=_text(
            title,
            [
                f"Enter this code to finish signing in: {code}",
                f"The code works once and expires in {minutes} minutes.",
                "If you did not try to sign in, you can ignore this email.",
            ],
        ),
    )


TEMPLATES: dict[str, Callable[[dict[str, Any]], RenderedEmail]] = {
    "login_code": _login_code,
    "trial_notice": _trial_notice,
    "alert": _alert,
    "weekly_digest": _weekly_digest,
    "report_ready": _report_ready,
    "registration_received": _registration_received,
    "registration_submitted": _registration_submitted,
    "welcome": _welcome,
    "rejected": _rejected,
    "invitation": _invitation,
    "scan_completed": _scan_completed,
    "scan_failed": _scan_failed,
    "secret_expiring": _secret_expiring,
    "risky_changes": _risky_changes,
}


def render(template: str, context: dict[str, Any]) -> RenderedEmail:
    try:
        fn = TEMPLATES[template]
    except KeyError as exc:
        raise ValueError(f"unknown email template: {template}") from exc
    return fn(context)

"""Azure Communication Services Email, connected with a connection string.

This is the one file to replace or edit when the Communication Services resource changes
(decision 0047). Nothing else in the code base talks to the service directly: the rest of the
application only sees the `EmailSender` interface (`services/infra/email.py`).

Configuration (backend/.env, never in code):

    EMAIL_MODE=acs
    ACS_CONNECTION_STRING=endpoint=https://<resource>.communication.azure.com/;accesskey=<key>
    EMAIL_SENDER=DoNotReply@<verified-domain>

Quick test without starting the app:

    python -m kloudrecon.integrations.communication_email you@example.com
"""

from __future__ import annotations

import base64
import sys
from typing import Any

from azure.communication.email import EmailClient

from kloudrecon.services.infra.email import OutgoingEmail


class CommunicationServiceEmailSender:
    """Implements `EmailSender` on top of `EmailClient.from_connection_string`."""

    def __init__(self, connection_string: str, sender: str) -> None:
        if not connection_string or connection_string == "null":
            raise RuntimeError("ACS_CONNECTION_STRING is not set (backend/.env).")
        if not sender or "<" in sender:
            raise RuntimeError("EMAIL_SENDER must be an address on a verified ACS domain.")
        self._client = EmailClient.from_connection_string(connection_string)
        self._sender = sender

    def send(self, message: OutgoingEmail) -> str:
        payload: dict[str, Any] = {
            "senderAddress": self._sender,
            "recipients": {"to": [{"address": address} for address in message.to]},
            "content": {
                "subject": message.subject,
                "plainText": message.text,
                "html": message.html,
            },
            "userEngagementTrackingDisabled": True,
        }
        if message.attachments:
            payload["attachments"] = [
                {
                    "name": name,
                    "contentType": content_type,
                    "contentInBase64": base64.b64encode(data).decode(),
                }
                for name, content_type, data in message.attachments
            ]
        poller = self._client.begin_send(payload)
        result = poller.result()
        return str(result.get("id", "")) if isinstance(result, dict) else ""


def main() -> None:
    """Send one test message with the settings from backend/.env."""
    from kloudrecon.core.config import get_settings

    if len(sys.argv) != 2:
        raise SystemExit("usage: python -m kloudrecon.integrations.communication_email <to>")
    settings = get_settings()
    sender = CommunicationServiceEmailSender(settings.acs_connection_string, settings.email_sender)
    message_id = sender.send(
        OutgoingEmail(
            to=[sys.argv[1]],
            subject="KloudRecon test email",
            html="<html><body><h1>KloudRecon</h1><p>Email delivery works.</p></body></html>",
            text="KloudRecon: email delivery works.",
        )
    )
    print("Message sent:", message_id)


if __name__ == "__main__":
    main()

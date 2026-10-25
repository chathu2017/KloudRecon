# 0014 — Client-credentials token request with httpx (not ClientSecretCredential)

**Status:** accepted · Phase 2

Plan 8.3 names `ClientSecretCredential`. `RestAzureGateway` sends the same OAuth2
client-credentials request to `login.microsoftonline.com/<tenant>/oauth2/v2.0/token` itself, with
httpx. Reasons: the AADSTS error body is available verbatim for friendly messages (7000215,
7000222, 700016, 90002 ...), and the token call can be replayed from recorded fixtures like every
other call. The secret is sent only in that form body; the gateway's `repr` hides it.

`FixtureTransport` replays recorded JSON fixtures (`backend/tests/fixtures/azure/`).
`RecordingTransport` + `scripts/record_azure_fixtures.py` capture new fixtures from a real test
subscription: token bodies are replaced by their `roles` claim only, and keys that look like
secrets are redacted.

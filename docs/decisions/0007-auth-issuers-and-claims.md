# 0007 — Entra External ID token validation details

**Status:** accepted · Phase 1

- **Issuer.** CIAM access tokens are issued by `https://<tenant-id>.ciamlogin.com/<tenant-id>/v2.0`.
  The plan names the subdomain host (`https://<subdomain>.ciamlogin.com/<tenant-id>/v2.0`). The API
  accepts both; nothing else.
- **Audience.** v2 access tokens carry the API app's client ID as `aud`; some setups emit the
  Application ID URI. Both `ENTRA_API_CLIENT_ID` and `ENTRA_API_AUDIENCE` are accepted.
- **Scope.** `scp` must contain `access_as_user`.
- **Identity.** The user key is the `oid` claim (fallback `sub`). Email comes from `email`,
  then `preferred_username`, then `emails[0]`. **The owner must add the optional claim `email`
  to the access token** of `kloudrecon-api` (App registration → Token configuration), otherwise
  sign-in fails with `token_missing_email`.
- **Extensibility.** Verifiers are registered per issuer (`VerifierRegistry`), so enterprise SSO
  can add another issuer later.
- **Dev mode.** `AUTH_MODE=dev` mints HS256 tokens (`iss=kloudrecon-dev`) via
  `POST /api/v1/auth/dev/login`; the endpoint returns 404 and settings validation fails when
  `ENV=prod`.

# 0047 — Real local sign-in: one-time email codes, owner password, optional Google / Microsoft

**Context.** The owner wants the local system to behave like the real product: no made-up
accounts, every sign-in confirmed with a 6-digit one-time code sent by email, the platform
owner signing in with email + password + code, a toggle between customers and the platform
owner on a modernized sign-in page, Google / Outlook sign-in, and the Azure Communication
Services code in its own, easily replaceable file. Entra External ID (decision 0007) stays the
production plan and the dev login stays for tests.

**Decision.**

- **A third auth mode, `AUTH_MODE=local`** (`VITE_AUTH_MODE=local` on the web). `dev` and
  `entra` are unchanged; automated tests and E2E keep using `dev`. In `local`, the dev login
  endpoints answer 404 and `seed-dev` creates plans only.
- **Customers ("Workspace")**: `POST /auth/otp/start` (email, optional name) emails a 6-digit
  code; `POST /auth/otp/verify` exchanges it for a session; `POST /auth/otp/resend` replaces
  it. An unknown email is a new sign-up and continues to onboarding and owner approval as before.
- **Platform owners ("Control Center")**: `POST /auth/owner/start` (email + password), then the
  same code step. An owner's email on the customer path gets the same answer as anyone, but no
  code is sent and none can succeed. The API also refuses an owner session whose token does not
  carry the password proof (`amr` contains `pwd`).
- **Codes**: `secrets.randbelow`, stored only as HMAC-SHA256 keyed with the platform signing
  key and bound to the challenge id, 10 minutes, 5 attempts, single use, constant-time compare.
  At most 5 codes per address and 20 per IP in 15 minutes, 30 seconds between resends, 4 sends
  per challenge. Wrong attempts are committed in their own transaction.
- **Passwords**: scrypt (n=2^15, r=8, p=1, standard library; no new dependency), at least 12
  characters with three character classes, 5 failures lock the credential for 15 minutes, the
  same answer and timing for a wrong password and an unknown address. Set only with
  `python -m kloudrecon.cli set-owner-password <email>` (hidden prompt or standard input); the
  password is never in code, the env file or the repository.
- **Sessions**: HS256 JWT signed with the platform signing key from the SecretStore (as demo
  sessions are), 12 hours, kept in `sessionStorage` (ends with the tab).
- **No Redis.** Challenges and credentials live in two small PostgreSQL tables
  (`auth_challenges`, `local_credentials`, migration 0014): they are transactional with the rest,
  need no new service, and the plan's stack stays as it is.
- **Email**: the code is sent by the API itself (not the worker queue), so sign-in does not
  depend on the worker; a send failure answers 503 and leaves no challenge. New template
  `login_code`.
- **Communication Services**: `backend/src/kloudrecon/integrations/communication_email.py` is
  the one file that talks to ACS with a connection string (`ACS_CONNECTION_STRING`,
  `EMAIL_MODE=acs`). Until the connection string is set, codes go to Mailpit
  (http://localhost:8025). The managed-identity sender for production is untouched.
- **Google / Microsoft**: OpenID Connect code flow with PKCE, state and nonce
  (`services/sso.py`). A button works only when its client id and secret are configured;
  otherwise it is shown disabled. By default (`SSO_REQUIRE_OTP=true`) the provider only
  identifies the visitor and KloudRecon still emails a code, which also covers Microsoft's
  unverified `email` claim; without the code step Microsoft additionally needs `xms_edov`.
  Owners cannot use a provider.
- **Sign-in page**: animated side panel (drifting wash, radar sweep from the logo, large brand
  name), glass form card, sliding "Workspace / Control Center" switch, six-box code entry on one
  real input (paste and one-time-code autofill work).
- **Local data**: the local database was recreated without dev or demo accounts. The public
  "View live demo" needs the Contoso Demo organization (`seed-demo`), so it is hidden until that
  is seeded again.

**Consequences.** Running E2E needs `AUTH_MODE=dev` / `VITE_AUTH_MODE=dev` and `seed-dev` +
`seed-demo` again. The Google and Microsoft flows are covered by unit tests with a mocked
provider; they have not been exercised against the real providers (no client ids yet).
